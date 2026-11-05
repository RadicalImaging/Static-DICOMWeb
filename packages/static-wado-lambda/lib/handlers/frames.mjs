import { gunzipSync } from 'node:zlib';
import {
  selectTargetSyntax,
  imageInfoFromDict,
  EXPLICIT_LITTLE_ENDIAN,
  JPEG_BASELINE,
  JPEG_XL_JPEG_RECOMPRESSION,
} from '@dcmjs/commands/pixel';
import {
  unwrapMultipart,
  wrapMultipart,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import uids from '@radicalimaging/static-wado-util/uids.mjs';
import { errorResponse } from '../handle.mjs';
import { instanceMetadata } from './metadata.mjs';
import { firstPart, storeParts, storedResponse } from './parts.mjs';

const WSI = '1.2.840.10008.5.1.4.1.1.77.1.6';

const first = (dict, tag) => dict?.[tag]?.Value?.[0];
const instanceDir = ({ studyUID, seriesUID, sopUID }) =>
  `studies/${studyUID}/series/${seriesUID}/instances/${sopUID}`;

const OCTET_STREAM = 'application/octet-stream';
const JPEG = 'image/jpeg';
const JLS = 'image/jls';
const JP2 = 'image/jp2';
const HTJ2K = 'image/jphc';
const JXL = 'image/jxl';

/**
 * The frame syntaxes that the upstream sends, with their media types: the 406 list of the IDC
 * public proxy (2026-11-05). `config.upstreamSyntaxes` replaces it.
 */
export const UPSTREAM_SYNTAXES = {
  [EXPLICIT_LITTLE_ENDIAN]: OCTET_STREAM,
  '1.2.840.10008.1.2.4.50': JPEG,
  '1.2.840.10008.1.2.4.51': JPEG,
  '1.2.840.10008.1.2.4.57': JPEG,
  '1.2.840.10008.1.2.4.70': JPEG,
  '1.2.840.10008.1.2.8.1': 'application/x-deflate',
  '1.2.840.10008.1.2.5': 'image/dicom-rle',
  '1.2.840.10008.1.2.4.80': JLS,
  '1.2.840.10008.1.2.4.81': JLS,
  '1.2.840.10008.1.2.4.90': JP2,
  '1.2.840.10008.1.2.4.91': JP2,
  '1.2.840.10008.1.2.4.201': HTJ2K,
  '1.2.840.10008.1.2.4.202': HTJ2K,
  '1.2.840.10008.1.2.4.203': HTJ2K,
  '1.2.840.10008.1.2.4.110': JXL,
  '1.2.840.10008.1.2.4.112': JXL,
};

/**
 * The `Accept` of a frame request for the final form `transferSyntaxUid` (D5): `.111` asks for
 * JPEG baseline, its only source; a syntax that the upstream sends asks for itself; any other
 * syntax asks for Explicit VR Little Endian.
 */
export function frameAccept(transferSyntaxUid, syntaxes = UPSTREAM_SYNTAXES) {
  const source =
    transferSyntaxUid === JPEG_XL_JPEG_RECOMPRESSION ? JPEG_BASELINE : transferSyntaxUid;
  const requested = syntaxes[source] ? source : EXPLICIT_LITTLE_ENDIAN;
  const type = syntaxes[requested] || OCTET_STREAM;
  return `multipart/related; type="${type}"; transfer-syntax=${requested}`;
}

/**
 * Gets one frame from the upstream (PRX-IMP-24) for the final form `transferSyntaxUid`, and
 * after a 406 or 500 with the default `Accept` of the client.
 */
async function fetchFrame(route, frame, transferSyntaxUid, context) {
  const { studyUID, seriesUID, sopUID } = route;
  const accept = frameAccept(transferSyntaxUid, context.config.upstreamSyntaxes);
  try {
    return await firstPart(
      await context.upstream.retrieveFrames(studyUID, seriesUID, sopUID, frame, { accept })
    );
  } catch (error) {
    if (error.status !== 406 && error.status !== 500) {
      throw error;
    }
  }
  return firstPart(await context.upstream.retrieveFrames(studyUID, seriesUID, sopUID, frame));
}

/** The stored instance metadata, from the metadata handler on a miss; undefined when unknown. */
async function loadInstanceMetadata(route, context) {
  const stored = await context.store.get(`${instanceDir(route)}/metadata`);
  if (stored) {
    return JSON.parse(gunzipSync(stored.body))[0];
  }
  const response = await instanceMetadata(route, undefined, context);
  return response.ok
    ? JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())))[0]
    : undefined;
}

/**
 * One frame in its stored form: from the store, or on a miss fetched, put through the rule
 * (PRX-IMP-15, PRX-IMP-16), and stored as multipart at `<instance>/frames/<n>`. An encode
 * failure stores the original frame with its own transfer syntax. Video keeps its frames: the
 * rule gives no target for it (PRX-USR-16).
 * @returns {Promise<{stored: Object, part: Object}|undefined>} undefined for an unknown instance
 */
async function storedFrame(route, frame, context) {
  const key = `${instanceDir(route)}/frames/${frame}`;
  const hit = await context.store.get(key);
  if (hit) {
    return { stored: hit, part: unwrapMultipart(hit.body)[0] };
  }
  const metadata = await loadInstanceMetadata(route, context);
  if (!metadata) {
    return undefined;
  }
  // No upstream syntax in the metadata: the Q30 assumption gives the request form.
  const assumed = first(metadata, '00080016') === WSI ? JPEG_BASELINE : EXPLICIT_LITTLE_ENDIAN;
  const fetched = await fetchFrame(route, frame, first(metadata, '00083002') ?? assumed, context);
  // The stored metadata can hold the destination syntax (D6), so the rule gets the response one.
  const incoming = fetched.transferSyntaxUid ?? assumed;
  let part = { ...fetched, transferSyntaxUid: incoming };
  const { target, reason } = selectTargetSyntax(metadata, {
    incomingTransferSyntax: incoming,
    rules: context.config.rules,
  });
  if (target) {
    try {
      const body = await context.compute.encode({
        frame: fetched.body,
        imageInfo: imageInfoFromDict(metadata),
        sourceUid: incoming,
        targetUid: target,
      });
      part = { body, contentType: uids[target].contentType, transferSyntaxUid: target };
    } catch (error) {
      console.warn('Frame encode failed, the original is stored', key, reason, error);
    }
  }
  return { stored: await storeParts(context.store, key, [part]), part };
}

/**
 * Frame miss (PRX-USR-5, PRX-USR-7). Without a variant, the frames in their stored multipart
 * form. A variant (`frames/<n>.<extension>`, from the edge mapping) must be in
 * `config.variants` (Q20):
 * - the extension of the stored syntax: the single-part codestream, stored at
 *   `<instance>/frames/<n>.<extension>`;
 * - another syntax: the upstream frame in that syntax, single-part and not stored.
 * Other variants give 406.
 */
export async function frames(route, request, context) {
  const variantSyntax =
    route.variant && Object.keys(uids).find(uid => uids[uid].extension === `.${route.variant}`);
  if (route.variant && (!variantSyntax || !context.config.variants?.includes(route.variant))) {
    return errorResponse({ status: 406 });
  }
  const found = [];
  for (const frame of route.frames) {
    const result = await storedFrame(route, frame, context);
    if (!result) {
      return errorResponse({ status: 404 });
    }
    found.push(result);
  }
  if (!route.variant) {
    // shortcut: a multi-frame request is answered, not stored; add a key when clients use it.
    return found.length === 1
      ? storedResponse(found[0].stored)
      : storedResponse(wrapMultipart(found.map(f => f.part)));
  }
  if (found.length !== 1) {
    return errorResponse({ status: 406 });
  }
  const contentType = uids[variantSyntax].contentType;
  const [{ part }] = found;
  if (part.transferSyntaxUid === variantSyntax) {
    const key = `${instanceDir(route)}/frames/${route.frames[0]}.${route.variant}`;
    await context.store.put(key, part.body, { contentType });
    return new Response(part.body, { headers: { 'Content-Type': contentType } });
  }
  const computed = await firstPart(
    await context.upstream.retrieveFrames(
      route.studyUID,
      route.seriesUID,
      route.sopUID,
      route.frames[0],
      { accept: frameAccept(variantSyntax, context.config.upstreamSyntaxes) }
    )
  );
  if (computed.transferSyntaxUid !== variantSyntax) {
    return errorResponse({ status: 406 });
  }
  return new Response(computed.body, { headers: { 'Content-Type': contentType } });
}

export default frames;
