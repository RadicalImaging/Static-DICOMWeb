import { gunzipSync } from 'node:zlib';
import { selectTargetSyntax, EXPLICIT_LITTLE_ENDIAN } from '@dcmjs/commands/pixel';
import { errorResponse } from '../handle.mjs';
import { loadInstanceMetadata } from './frames.mjs';
import { seriesMetadata } from './metadata.mjs';

/** The size of the `viewport` that the upstream renders into, as `create-dicomweb thumbnail` */
const SIZE = 256;

const first = (dict, tag) => dict?.[tag]?.Value?.[0];

/** The stored series metadata, from the metadata handler on a miss; undefined when unknown. */
async function loadSeriesMetadata(route, context) {
  const stored = await context.store.get(
    `studies/${route.studyUID}/series/${route.seriesUID}/metadata`
  );
  if (stored) {
    return JSON.parse(gunzipSync(stored.body));
  }
  const response = await seriesMetadata(route, undefined, context);
  return response.ok
    ? JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())))
    : undefined;
}

/**
 * Thumbnail miss (PRX-USR-4, PRX-IMP-9): the upstream rendered frame (`frames/<n>/rendered`
 * with `viewport`), stored as JPEG at the `create-dicomweb thumbnail` key. A series uses its
 * middle instance and middle frame, an instance its first frame. A study thumbnail and a video
 * instance give 404.
 * shortcut: the upstream renders the frame (the IDC proxy does); a cs3d render is needed only for
 * an upstream with no `rendered`.
 */
export async function thumbnail(route, request, context) {
  const { studyUID, seriesUID, sopUID } = route;
  if (!seriesUID) {
    return errorResponse({ status: 404 });
  }
  let metadata;
  let frame = 1;
  if (sopUID) {
    metadata = await loadInstanceMetadata(route, context);
  } else {
    const series = await loadSeriesMetadata(route, context);
    metadata = series?.[Math.floor(series.length / 2)];
    frame = Math.ceil((Number(first(metadata, '00280008')) || 1) / 2);
  }
  const incomingTransferSyntax = first(metadata, '00083002') ?? EXPLICIT_LITTLE_ENDIAN;
  if (!metadata || selectTargetSyntax(metadata, { incomingTransferSyntax }).reason === 'video') {
    return errorResponse({ status: 404 });
  }
  const sop = sopUID || first(metadata, '00080018');
  const response = await context.upstream.request(
    `studies/${studyUID}/series/${seriesUID}/instances/${sop}/frames/${frame}/rendered?viewport=${SIZE},${SIZE}`,
    'image/jpeg'
  );
  const body = Buffer.from(await response.arrayBuffer());
  const dir = `studies/${studyUID}/series/${seriesUID}${sopUID ? `/instances/${sopUID}` : ''}`;
  await context.store.put(`${dir}/thumbnail`, body, { contentType: 'image/jpeg' });
  return new Response(body, { headers: { 'Content-Type': 'image/jpeg' } });
}

export default thumbnail;
