import { DicomWebFetchError } from '@dcmjs-org/commands/dicomweb-fetch';
import { Tags } from '@radicalimaging/static-wado-util/dictionary/Tags.mjs';
import { errorResponse } from '../handle.mjs';
import { storedJson } from '../stores/decodedBody.mjs';
import { isVideo, loadInstanceMetadata } from './frames.mjs';
import { seriesMetadata } from './metadata.mjs';

/** The size of the `viewport` that the upstream renders into, as `create-dicomweb thumbnail` */
const SIZE = 256;

/** Modalities with no image to render: the OHIF `NON_IMAGE_MODALITIES`, with DOC and KO */
export const NON_IMAGE_MODALITIES = ['SEG', 'SR', 'DOC', 'PR', 'RTSTRUCT', 'RTPLAN', 'KO'];

/** The stored series metadata, from the metadata handler on a miss; undefined when unknown. */
async function loadSeriesMetadata(route, context) {
  const stored = await context.store.get(
    `studies/${route.studyUID}/series/${route.seriesUID}/metadata`
  );
  if (stored) {
    return storedJson(stored);
  }
  const response = await seriesMetadata(route, undefined, context);
  return response.ok ? storedJson(response) : undefined;
}

/**
 * The JPEG of a series or instance thumbnail: the upstream rendered frame. A series uses its
 * middle instance and middle frame, an instance its first frame.
 * @returns {Promise<Buffer|undefined>} undefined for an unknown instance, a non-image modality,
 *   or a video
 */
async function renderThumbnail(route, context) {
  const { studyUID, seriesUID, sopUID } = route;
  let metadata;
  if (sopUID) {
    metadata = await loadInstanceMetadata(route, context);
  } else {
    const series = await loadSeriesMetadata(route, context);
    metadata = series?.[Math.floor(series.length / 2)];
  }
  if (
    !metadata ||
    NON_IMAGE_MODALITIES.includes(Tags.getValue(metadata, Tags.Modality)) ||
    isVideo(metadata)
  ) {
    return undefined;
  }
  const frame = sopUID
    ? 1
    : Math.ceil((Number(Tags.getValue(metadata, Tags.NumberOfFrames)) || 1) / 2);
  const sop = sopUID || Tags.getValue(metadata, Tags.SOPInstanceUID);
  const response = await context.upstream.request(
    `studies/${studyUID}/series/${seriesUID}/instances/${sop}/frames/${frame}/rendered?viewport=${SIZE},${SIZE}`,
    'image/jpeg'
  );
  return Buffer.from(await response.arrayBuffer());
}

/**
 * The thumbnail of the first series, by SeriesNumber, that gives one. Non-image modalities are
 * not tried. A series that gives no thumbnail (video, or an upstream 4xx other than 429) is
 * skipped; other upstream errors end the request.
 */
async function studyThumbnail(route, context) {
  const number = series => {
    const value = Number(Tags.getValue(series, Tags.SeriesNumber) ?? NaN);
    return Number.isNaN(value) ? Infinity : value;
  };
  const candidates = (await context.upstream.search(`studies/${route.studyUID}/series`))
    .filter(series => !NON_IMAGE_MODALITIES.includes(Tags.getValue(series, Tags.Modality)))
    .sort((a, b) => number(a) - number(b));
  for (const series of candidates) {
    const seriesUID = Tags.getValue(series, Tags.SeriesInstanceUID);
    try {
      const body = await renderThumbnail({ studyUID: route.studyUID, seriesUID }, context);
      if (body) {
        return body;
      }
    } catch (error) {
      const skip =
        error instanceof DicomWebFetchError && error.status < 500 && error.status !== 429;
      if (!skip) {
        throw error;
      }
    }
  }
  return undefined;
}

/**
 * Thumbnail miss (PRX-USR-4, PRX-IMP-9): the upstream rendered frame (`frames/<n>/rendered`
 * with `viewport`), stored as JPEG at the `create-dicomweb thumbnail` key. A study uses the
 * first series that gives a thumbnail. A video instance, and a series or instance of a
 * non-image modality, give 404 with no `rendered` request.
 * shortcut: the upstream renders the frame (the IDC proxy does); a cs3d render is needed only for
 * an upstream with no `rendered`.
 */
export async function thumbnail(route, request, context) {
  const { studyUID, seriesUID, sopUID } = route;
  const body = seriesUID
    ? await renderThumbnail(route, context)
    : await studyThumbnail(route, context);
  if (!body) {
    return errorResponse({ status: 404 });
  }
  const dir = `studies/${studyUID}${seriesUID ? `/series/${seriesUID}` : ''}${
    sopUID ? `/instances/${sopUID}` : ''
  }`;
  await context.store.put(`${dir}/thumbnail`, body, { contentType: 'image/jpeg' });
  return new Response(body, { headers: { 'Content-Type': 'image/jpeg' } });
}

export default thumbnail;
