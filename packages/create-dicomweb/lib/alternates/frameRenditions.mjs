import { v4 as uuid } from 'uuid';
import { Tags, uids, boxAverage } from '@radicalimaging/static-wado-util';
import { FileDicomWebWriter } from '../instance/FileDicomWebWriter.mjs';
import { readFrameBytes } from '../instance/readFramePixelData.mjs';
import {
  HTJ2K_LOSSLESS_TRANSFER_SYNTAX_UID,
  HTJ2K_LOSSY_TRANSFER_SYNTAX_UID,
  JLS_LOSSLESS_TRANSFER_SYNTAX_UID,
  canEncodeGrayscaleFrames,
  getImageAttributes,
  pixelArrayType,
  toImageInfo,
  toPixelValueModel,
  viewPixelBytes,
} from './imageAttributes.mjs';

const { getValue } = Tags;

/** Rendition directory holding a full resolution JPEG-LS copy of every frame */
export const JLS_RENDITION = 'jls';

/** Rendition directory holding a quarter resolution JPEG-LS copy of every frame */
export const JLS_THUMBNAIL_RENDITION = 'jlsThumbnail';

/** Rendition directory holding a full resolution lossless HTJ2K copy of every frame */
export const HTJ2K_RENDITION = 'htj2k';

/** Rendition directory holding a full resolution lossy HTJ2K copy of every frame */
export const HTJ2K_LOSSY_RENDITION = 'htj2kLossy';

/** In-plane reduction factor of the thumbnail rendition */
export const THUMBNAIL_REDUCTION = 4;

/**
 * The per-frame renditions that can be written beside `frames/`, by directory name.
 *
 * A rendition is a transfer syntax plus an in-plane reduction, and nothing else varies, so
 * adding one is an entry here rather than a code path. The reduction is applied before encoding
 * and the encoder settings come from the transfer syntax, in `codecFrame`.
 */
export const FRAME_RENDITIONS = Object.freeze({
  [JLS_RENDITION]: {
    name: JLS_RENDITION,
    transferSyntaxUID: JLS_LOSSLESS_TRANSFER_SYNTAX_UID,
    reduction: 1,
    lossy: false,
  },
  [JLS_THUMBNAIL_RENDITION]: {
    name: JLS_THUMBNAIL_RENDITION,
    transferSyntaxUID: JLS_LOSSLESS_TRANSFER_SYNTAX_UID,
    reduction: THUMBNAIL_REDUCTION,
    lossy: false,
  },
  [HTJ2K_RENDITION]: {
    name: HTJ2K_RENDITION,
    transferSyntaxUID: HTJ2K_LOSSLESS_TRANSFER_SYNTAX_UID,
    reduction: 1,
    lossy: false,
  },
  [HTJ2K_LOSSY_RENDITION]: {
    name: HTJ2K_LOSSY_RENDITION,
    transferSyntaxUID: HTJ2K_LOSSY_TRANSFER_SYNTAX_UID,
    reduction: 1,
    lossy: true,
  },
});

/** Rendition names, in the order they are reported */
export const FRAME_RENDITION_NAMES = Object.freeze(Object.keys(FRAME_RENDITIONS));

/** How often to report progress, in instances */
const PROGRESS_INSTANCE_INTERVAL = 25;

/**
 * The dimensions a rendition's frames are written at.
 * @param {Object} attributes - Image attributes of the instance
 * @param {Object} rendition - A FRAME_RENDITIONS entry
 * @returns {{rows: number, columns: number}}
 */
export function renditionDimensions(attributes, rendition) {
  if (rendition.reduction === 1) {
    return { rows: attributes.rows, columns: attributes.columns };
  }
  return {
    rows: Math.round(attributes.rows / rendition.reduction),
    columns: Math.round(attributes.columns / rendition.reduction),
  };
}

/**
 * Resolves rendition names to their definitions.
 * @param {string[]} names - Rendition directory names
 * @returns {Object[]} - FRAME_RENDITIONS entries
 */
export function resolveRenditions(names) {
  return names.map(name => {
    const rendition = FRAME_RENDITIONS[name];
    if (!rendition) {
      throw new Error(
        `unknown rendition ${name}; expected one of ${FRAME_RENDITION_NAMES.join(', ')}`
      );
    }
    return rendition;
  });
}

/**
 * Writes one frame of a rendition as multipart/related, the same shape `frames/` uses, so the
 * existing image loaders can read it by substituting the path.
 * @param {Object} writer - FileDicomWebWriter positioned on the instance
 * @param {string} renditionName - Rendition directory, e.g. 'jls'
 * @param {number} frameNumber - 1-based frame number
 * @param {string} transferSyntaxUid - Transfer syntax of the data
 * @param {Uint8Array} data - The encoded frame
 * @returns {Promise<void>}
 */
async function writeRenditionFrame(writer, renditionName, frameNumber, transferSyntaxUid, data) {
  const type = uids[transferSyntaxUid] || uids.default || {};
  const streamInfo = await writer.openInstanceStream(`${frameNumber}.mht`, {
    path: renditionName,
    gzip: false,
    multipart: true,
    boundary: `BOUNDARY_${uuid()}`,
    contentType: `${type.contentType || 'application/octet-stream'};transfer-syntax=${transferSyntaxUid}`,
    streamKey: `${renditionName}:${frameNumber}`,
  });
  streamInfo.write(data);
  await writer.closeStream(streamInfo.streamKey);
  const failure = streamInfo.getFailureMessage();
  if (failure) {
    throw new Error(`Failed writing ${renditionName}/${frameNumber}.mht: ${failure}`);
  }
}

/**
 * Generates the requested per-frame renditions for one series.
 *
 * Each frame is read and decoded once however many renditions are wanted, since decoding
 * dominates the cost, and each distinct reduction is computed once and shared by the renditions
 * that encode at that size. Frames whose output already exists are left alone unless `force` is
 * set, so a run interrupted part way through a series completes rather than repeating itself.
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.baseDir - Base directory for the DICOMweb structure
 * @param {string} params.studyUID - Study Instance UID
 * @param {string} params.seriesUID - Series Instance UID
 * @param {Object[]} params.instanceMetadataArray - Series metadata
 * @param {Object} params.reader - FileDicomWebReader
 * @param {Object} params.codec - { decodeFrameToBytes, encodeFrameFromPixelData }
 * @param {string[]} params.renditions - Rendition names to generate
 * @param {boolean} params.force - Regenerate frames whose output already exists
 * @param {(message: string) => void} params.log - Progress logger
 * @returns {Promise<{written: Object, skipped: Object, skippedInstances: Object[]}>}
 */
export async function generateFrameRenditions({
  baseDir,
  studyUID,
  seriesUID,
  instanceMetadataArray,
  reader,
  codec,
  renditions,
  force,
  log,
}) {
  const requested = resolveRenditions(renditions);
  const written = {};
  const skipped = {};
  for (const rendition of requested) {
    written[rendition.name] = 0;
    skipped[rendition.name] = 0;
  }
  const skippedInstances = [];
  let instancesDone = 0;

  /**
   * Written counts as `n name` pairs, for the progress lines.
   * @returns {string}
   */
  const writtenSummary = () =>
    requested.map(rendition => `${written[rendition.name]} ${rendition.name}`).join(' / ');

  for (const instanceMetadata of instanceMetadataArray) {
    const instanceUid = getValue(instanceMetadata, Tags.SOPInstanceUID);
    const attributes = getImageAttributes(instanceMetadata);

    const encodable = canEncodeGrayscaleFrames(attributes);
    if (!encodable.ok) {
      skippedInstances.push({ instanceUid, reason: encodable.reason });
      continue;
    }

    const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUid);
    const ArrayType = pixelArrayType(attributes);
    const model = toPixelValueModel(attributes);

    // A rendition that reduces below one sample has nothing to write for this instance, which
    // is an instance level fact: a study can hold both a 512 acquisition and a 4x4 localiser.
    const targets = [];
    for (const rendition of requested) {
      const { rows, columns } = renditionDimensions(attributes, rendition);
      if (rows < 1 || columns < 1) {
        skippedInstances.push({
          instanceUid,
          reason: `${attributes.columns}x${attributes.rows} is too small to reduce by ${rendition.reduction} for ${rendition.name}`,
        });
        continue;
      }
      targets.push({ rendition, rows, columns });
    }
    if (targets.length === 0) {
      continue;
    }

    // One buffer per distinct reduction, reused for every frame of the instance
    const reducedBuffers = new Map();
    for (const target of targets) {
      if (target.rendition.reduction > 1 && !reducedBuffers.has(target.rendition.reduction)) {
        reducedBuffers.set(target.rendition.reduction, new ArrayType(target.rows * target.columns));
      }
    }

    const writer = new FileDicomWebWriter(
      {
        studyInstanceUid: studyUID,
        seriesInstanceUid: seriesUID,
        sopInstanceUid: instanceUid,
      },
      { baseDir }
    );

    try {
      await writeInstanceRenditions();
    } catch (error) {
      // One instance the codec cannot handle should cost that instance, not the study. The
      // renditions are additive, so what was written before the failure stays valid and a
      // re-run picks up where this left off.
      skippedInstances.push({
        instanceUid,
        reason: `failed after ${writtenSummary()} frames: ${error?.message ?? error}`,
      });
      console.warn(`  ${instanceUid}: ${error?.message ?? error}`);
    }

    instancesDone += 1;
    console.verbose(
      `  instance ${instanceUid}: ${attributes.numberOfFrames} frame(s), ${writtenSummary()} written so far`
    );
    if (instancesDone % PROGRESS_INSTANCE_INTERVAL === 0) {
      log(`  ${instancesDone}/${instanceMetadataArray.length} instances: ${writtenSummary()}`);
    }

    /**
     * Writes every requested rendition of every frame of the current instance.
     * @returns {Promise<void>}
     */
    async function writeInstanceRenditions() {
      for (let frameNumber = 1; frameNumber <= attributes.numberOfFrames; frameNumber++) {
        const needed = [];
        for (const target of targets) {
          if (!force && frameExists(reader, instancePath, target.rendition.name, frameNumber)) {
            skipped[target.rendition.name] += 1;
            continue;
          }
          needed.push(target);
        }
        if (needed.length === 0) {
          continue;
        }

        const { bytes, transferSyntaxUid } = await readFrameBytes(
          baseDir,
          studyUID,
          seriesUID,
          instanceMetadata,
          frameNumber
        );
        const raw = await codec.decodeFrameToBytes(
          bytes,
          toImageInfo(attributes),
          transferSyntaxUid
        );
        const pixels = viewPixelBytes(ArrayType, raw);

        // Reduce once per size, however many renditions encode at it
        const reduced = new Map();
        for (const target of needed) {
          const { reduction } = target.rendition;
          if (reduction === 1 || reduced.has(reduction)) {
            continue;
          }
          const buffer = reducedBuffers.get(reduction);
          boxAverage(
            {
              rows: attributes.rows,
              columns: attributes.columns,
              pixelData: pixels,
              samplesPerPixel: 1,
              pixelValueModel: model,
            },
            { rows: target.rows, columns: target.columns, pixelData: buffer }
          );
          reduced.set(reduction, buffer);
        }

        for (const target of needed) {
          const { rendition, rows, columns } = target;
          const source = rendition.reduction === 1 ? pixels : reduced.get(rendition.reduction);
          const encoded = await codec.encodeFrameFromPixelData(
            source,
            toImageInfo(attributes, { rows, columns }),
            rendition.transferSyntaxUID
          );
          await writeRenditionFrame(
            writer,
            rendition.name,
            frameNumber,
            rendition.transferSyntaxUID,
            encoded
          );
          written[rendition.name] += 1;
        }
      }
    }
  }

  return { written, skipped, skippedInstances };
}

/**
 * Tells whether a rendition frame has already been written.
 * @param {Object} reader - FileDicomWebReader
 * @param {string} instancePath - Relative instance path
 * @param {string} renditionName - Rendition directory
 * @param {number} frameNumber - 1-based frame number
 * @returns {boolean}
 */
function frameExists(reader, instancePath, renditionName, frameNumber) {
  return !!reader.fileExists(`${instancePath}/${renditionName}`, `${frameNumber}.mht`);
}
