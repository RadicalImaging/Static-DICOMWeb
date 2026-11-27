import dcmjs from 'dcmjs';
import {
  selectTargetSyntax,
  imageInfoFromDict,
  EXPLICIT_LITTLE_ENDIAN,
  JPEG_BASELINE,
  JPEG_XL_JPEG_RECOMPRESSION,
} from '@dcmjs-org/commands/pixel';
import {
  unwrapMultipart,
  wrapMultipart,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import uids from '@radicalimaging/static-wado-util/uids.mjs';
import { Tags } from '@radicalimaging/static-wado-util/dictionary/Tags.mjs';
import { errorResponse } from '../handle.mjs';
import { decodedBody, storedJson } from '../stores/decodedBody.mjs';
import { instanceMetadata } from './metadata.mjs';
import { instanceDir } from './instance.mjs';
import { boundaryOf, firstPart, storeParts, storedResponse } from './parts.mjs';

const WSI = '1.2.840.10008.5.1.4.1.1.77.1.6';
/** The video SOP classes of `selectTargetSyntax` of dcmjs-commands, which does not export them */
const VIDEO_SOP_CLASSES = [
  '1.2.840.10008.5.1.4.1.1.77.1.1.1',
  '1.2.840.10008.5.1.4.1.1.77.1.2.1',
  '1.2.840.10008.5.1.4.1.1.77.1.4.1',
];
const { isVideoTransferSyntax } = dcmjs.constants;

const OCTET_STREAM = 'application/octet-stream';
const JPEG = 'image/jpeg';
const JLS = 'image/jls';
const JP2 = 'image/jp2';
const HTJ2K = 'image/jphc';
const JXL = 'image/jxl';

/**
 * The frame syntaxes that the upstream sends, with their media types: the 406 list of the IDC
 * public proxy (2026-11-05). `config.upstreamSyntaxes` replaces it. Not the `uids` content
 * types: the upstream uses `image/jpeg` for `.70` and `application/x-deflate` for `.1.2.8.1`.
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

/** The PS3.18 default syntax of a frame media type; `image/jpeg` reads the SOF marker */
const MEDIA_TYPE_SYNTAXES = {
  [OCTET_STREAM]: EXPLICIT_LITTLE_ENDIAN,
  'image/dicom-rle': '1.2.840.10008.1.2.5',
  [JLS]: '1.2.840.10008.1.2.4.80',
  [JP2]: '1.2.840.10008.1.2.4.90',
  [HTJ2K]: '1.2.840.10008.1.2.4.201',
};
const JPEG_SOF_SYNTAXES = {
  0xc0: JPEG_BASELINE,
  0xc1: '1.2.840.10008.1.2.4.51',
  0xc3: '1.2.840.10008.1.2.4.57',
};

/**
 * The transfer syntax of a frame part with no `transfer-syntax` parameter (PRX-IMP-16): the
 * syntax that the request named, when the part has the media type of that request; else the
 * syntax of the media type. Undefined when neither gives one.
 */
function partSyntax({ contentType, body, requested }, syntaxes = UPSTREAM_SYNTAXES) {
  if (requested && syntaxes[requested] === contentType) {
    return requested;
  }
  if (contentType !== JPEG) {
    return MEDIA_TYPE_SYNTAXES[contentType];
  }
  // Walk the marker segments after SOI to the SOF marker.
  for (let i = 2; i + 3 < body.length && body[i] === 0xff; i += 2 + body.readUInt16BE(i + 2)) {
    if (JPEG_SOF_SYNTAXES[body[i + 1]]) {
      return JPEG_SOF_SYNTAXES[body[i + 1]];
    }
  }
  return undefined;
}

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

/** The `Accept` of a frame of a video-capable instance: the stored form (PRX-IMP-18) */
const STORED_FORM_ACCEPT = 'multipart/related; type="application/octet-stream"; transfer-syntax=*';

/**
 * True for a video-capable instance (PRX-USR-16, PRX-IMP-18): a video SOP class, or a video
 * transfer syntax in (0008,3002) of the stored metadata.
 * @param {Object} metadata - The stored instance metadata
 */
export const isVideo = metadata =>
  VIDEO_SOP_CLASSES.includes(Tags.getValue(metadata, Tags.SOPClassUID)) ||
  Boolean(isVideoTransferSyntax(Tags.getValue(metadata, Tags.AvailableTransferSyntaxUID)));

/**
 * Gets one frame from the upstream (PRX-IMP-24) with `accept`, and after a 406 or 500 with the
 * default `Accept` of the client. `requested` is the syntax that `accept` names.
 */
async function fetchFrame(route, frame, accept, context) {
  const { studyUID, seriesUID, sopUID } = route;
  try {
    const part = await firstPart(
      await context.upstream.retrieveFrames(studyUID, seriesUID, sopUID, frame, { accept })
    );
    return { ...part, requested: /transfer-syntax=([\d.]+)/.exec(accept)?.[1] };
  } catch (error) {
    if (error.status !== 406 && error.status !== 500) {
      throw error;
    }
  }
  return firstPart(await context.upstream.retrieveFrames(studyUID, seriesUID, sopUID, frame));
}

/** The stored instance metadata, from the metadata handler on a miss; undefined when unknown. */
export async function loadInstanceMetadata(route, context) {
  const stored = await context.store.get(`${instanceDir(route)}/metadata`);
  if (stored) {
    return (await storedJson(stored))[0];
  }
  const response = await instanceMetadata(route, undefined, context);
  return response.ok ? (await storedJson(response))[0] : undefined;
}

/**
 * One frame in its stored form: from the store, or on a miss fetched, put through the rule
 * (PRX-IMP-15, PRX-IMP-16), and stored as multipart at `<instance>/frames/<n>`. An encode
 * failure stores the original frame with its own transfer syntax. Video keeps its frames in
 * the stored form of the upstream, with no rule (PRX-USR-16). A stored object that is not
 * multipart throws: the proxy never replaces a stored object (PRX-IMP-26).
 * @returns {Promise<{stored: Object, part: Object}|undefined>} undefined for an unknown instance
 */
async function storedFrame(route, frame, context) {
  const key = `${instanceDir(route)}/frames/${frame}`;
  const hit = await context.store.get(key);
  if (hit) {
    const part = unwrapMultipart(decodedBody(hit))?.[0];
    if (!part) {
      throw new Error(`The stored frame ${key} is not multipart`);
    }
    return { stored: hit, part };
  }
  const metadata = await loadInstanceMetadata(route, context);
  if (!metadata) {
    return undefined;
  }
  // No upstream syntax in the metadata: the Q30 assumption gives the request form.
  const assumed =
    Tags.getValue(metadata, Tags.SOPClassUID) === WSI ? JPEG_BASELINE : EXPLICIT_LITTLE_ENDIAN;
  const finalForm = Tags.getValue(metadata, Tags.AvailableTransferSyntaxUID) ?? assumed;
  const video = isVideo(metadata);
  const fetched = await fetchFrame(
    route,
    frame,
    video ? STORED_FORM_ACCEPT : frameAccept(finalForm, context.config.upstreamSyntaxes),
    context
  );
  // The stored metadata can hold the destination syntax (D6), so the rule gets the response one.
  const incoming =
    fetched.transferSyntaxUid ?? partSyntax(fetched, context.config.upstreamSyntaxes) ?? assumed;
  let part = { body: fetched.body, contentType: fetched.contentType, transferSyntaxUid: incoming };
  const { target, reason } = video
    ? {}
    : selectTargetSyntax(metadata, {
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
 * - another syntax: the upstream frame in a syntax of that extension that the upstream sends,
 *   single-part and not stored.
 * Other variants give 406, with no upstream request when the upstream sends no such syntax, or
 * when the syntax is lossy and the stored syntax is lossless (Q20).
 * The edge mapping never gives such a path for an `Accept` header (PRX-IMP-31).
 */
export async function frames(route, request, context) {
  if (!route.frames?.length) {
    return errorResponse({ status: 400 });
  }
  const variantSyntaxes = route.variant
    ? Object.keys(uids).filter(uid => uids[uid].extension === `.${route.variant}`)
    : [];
  if (
    route.variant &&
    (!variantSyntaxes.length || !context.config.variants?.includes(route.variant))
  ) {
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
    const key = `${instanceDir(route)}/frames/${route.frames.join(',')}`;
    return found.length === 1
      ? storedResponse(found[0].stored)
      : storedResponse(
          wrapMultipart(
            found.map(f => f.part),
            boundaryOf(key)
          )
        );
  }
  if (found.length !== 1) {
    return errorResponse({ status: 406 });
  }
  const [{ part }] = found;
  if (variantSyntaxes.includes(part.transferSyntaxUid)) {
    const { contentType } = uids[part.transferSyntaxUid];
    const key = `${instanceDir(route)}/frames/${route.frames[0]}.${route.variant}`;
    await context.store.put(key, part.body, { contentType });
    return new Response(part.body, { headers: { 'Content-Type': contentType } });
  }
  const sent = context.config.upstreamSyntaxes ?? UPSTREAM_SYNTAXES;
  const variantSyntax = variantSyntaxes.find(uid => sent[uid]);
  // Q20: no lossy variant of lossless data.
  if (!variantSyntax || (uids[variantSyntax].lossy && !uids[part.transferSyntaxUid]?.lossy)) {
    return errorResponse({ status: 406 });
  }
  const { contentType } = uids[variantSyntax];
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
