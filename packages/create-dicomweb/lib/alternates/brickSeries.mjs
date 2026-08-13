import fs from 'fs';
import path from 'path';
import { Tags } from '@radicalimaging/static-wado-util';
import { FileDicomWebWriter } from '../instance/FileDicomWebWriter.mjs';
import { readFrameBytes } from '../instance/readFramePixelData.mjs';
import { seriesSummary } from '../instance/SeriesSummary.mjs';
import {
  pixelArrayType,
  toImageInfo,
  toPixelValueModel,
  viewPixelBytes,
} from './imageAttributes.mjs';
import { buildSeriesGeometry } from './seriesGeometry.mjs';
import {
  BRICK_CODECS,
  BRICK_CODEC_JLS,
  BRICK_MANIFEST_FILENAME,
  DEFAULT_BRICK_SIZE,
  brickDirectory,
  brickFilename,
  buildManifest,
  generateBrickStore,
} from './brickStore.mjs';
import { BRICK_ORDER_Z_MINOR } from './brickPacking.mjs';
import {
  readInstanceMetadata,
  setBrickManifestUri,
  writeInstanceMetadata,
} from './instanceMetadata.mjs';

const { getValue } = Tags;

/** Directory holding a series' brick store */
export const BRICK_DIRECTORY = 'brick';

/**
 * Generates the brick store for one series, or explains why it did not.
 *
 * Ineligible series are reported rather than failed: a study is a mixture of acquisitions, and
 * a localiser or a segmentation having no use for a brick store is not an error.
 *
 * @param {Object} params - Generation parameters
 * @param {string} params.baseDir - Base directory for the DICOMweb structure
 * @param {string} params.studyUID - Study Instance UID
 * @param {string} params.seriesUID - Series Instance UID
 * @param {Object[]} params.instanceMetadataArray - Series metadata
 * @param {Object} params.reader - FileDicomWebReader
 * @param {Object} params.codec - { decodeFrameToBytes, encodeFrameFromPixelData }
 * @param {number} [params.brickSize=64] - Brick edge length
 * @param {string} [params.order='z-minor'] - Brick row ordering
 * @param {string} [params.brickCodec='jls'] - Encoding the bricks are written in
 * @param {boolean} [params.force] - Regenerate even when a manifest already exists
 * @param {(message: string) => void} params.log - Progress logger
 * @returns {Promise<{generated: boolean, reason?: string, levels?: Object[], manifest?: Object, bricksWritten?: number}>}
 */
export async function generateSeriesBrickStore({
  baseDir,
  studyUID,
  seriesUID,
  instanceMetadataArray,
  reader,
  codec,
  brickSize = DEFAULT_BRICK_SIZE,
  order = BRICK_ORDER_Z_MINOR,
  brickCodec = BRICK_CODEC_JLS,
  force = false,
  log,
}) {
  const encoding = BRICK_CODECS[brickCodec];
  if (!encoding) {
    throw new Error(
      `unsupported brick codec ${brickCodec}; expected one of ${Object.keys(BRICK_CODECS).join(', ')}`
    );
  }
  const seriesPath = reader.getSeriesPath(studyUID, seriesUID);
  const brickPath = `${seriesPath}/${BRICK_DIRECTORY}`;
  const brickDir = path.join(baseDir, brickPath);

  const geometry = buildSeriesGeometry(instanceMetadataArray);
  if (!geometry.eligible) {
    return { generated: false, reason: geometry.reason };
  }

  const existingManifest = await reader.readJsonFile(brickPath, BRICK_MANIFEST_FILENAME);
  if (existingManifest && !force) {
    return {
      generated: false,
      reason: 'already generated (pass --force to regenerate)',
      levels: existingManifest.levels,
      manifest: existingManifest,
    };
  }
  if (force && fs.existsSync(brickDir)) {
    // A regenerated store can have fewer levels or fewer bricks per level than the one it
    // replaces, and leftovers would contradict the manifest, so the old store goes first.
    log(`  removing existing brick store at ${brickPath}`);
    await fs.promises.rm(brickDir, { recursive: true, force: true });
  }

  const { attributes } = geometry;
  const ArrayType = pixelArrayType(attributes);
  const model = toPixelValueModel(attributes);
  const planeLength = attributes.rows * attributes.columns;

  const writer = new FileDicomWebWriter(
    { studyInstanceUid: studyUID, seriesInstanceUid: seriesUID },
    { baseDir }
  );

  const readPlane = async frame => {
    const { bytes, transferSyntaxUid } = await readFrameBytes(
      baseDir,
      studyUID,
      seriesUID,
      frame.instanceMetadata,
      frame.frameNumber
    );
    const raw = await codec.decodeFrameToBytes(bytes, toImageInfo(attributes), transferSyntaxUid);
    const plane = viewPixelBytes(ArrayType, raw);
    if (plane.length !== planeLength) {
      throw new Error(
        `frame ${frame.instanceUid}/${frame.frameNumber} decoded to ${plane.length} samples, expected ${planeLength}`
      );
    }
    return plane;
  };

  const encodeBrick = (packed, packedDims) =>
    codec.encodeFrameFromPixelData(
      packed,
      toImageInfo(attributes, { rows: packedDims.rows, columns: packedDims.columns }),
      encoding.transferSyntaxUID
    );

  const storeBrick = async (descriptor, data) => {
    const relativeDir = `${BRICK_DIRECTORY}/${brickDirectory(descriptor)}`;
    const filename = brickFilename(descriptor, encoding.extension);
    const streamInfo = await writer.openSeriesStream(filename, {
      path: relativeDir,
      gzip: false,
      streamKey: `brick:${relativeDir}/${filename}`,
    });
    streamInfo.write(data);
    await writer.closeStream(streamInfo.streamKey);
    const failure = streamInfo.getFailureMessage();
    if (failure) {
      throw new Error(`Failed writing ${relativeDir}/${filename}: ${failure}`);
    }
  };

  const spacing = geometry.voxelSpacing;

  log(
    `  bricking ${attributes.columns}x${attributes.rows}x${geometry.sizeZ}` +
      `${geometry.nonSpatialSize > 1 ? ` x ${geometry.nonSpatialSize} non-spatial` : ''}` +
      ` at ${brickSize}³, ${order}, ${encoding.name}` +
      ` (spacing ${spacing.map(value => value.toFixed(3)).join('/')} mm)`
  );

  const { levels, plan, bricksWritten } = await generateBrickStore({
    geometry,
    brickSize,
    spacing,
    order,
    model,
    ArrayType,
    readPlane,
    encodeBrick,
    storeBrick,
    onProgress: message => log(`    ${message}`),
  });

  for (const level of plan) {
    const [nkx, nky, nkz] = level.bricks;
    log(
      `    ${level.name}: ${level.size.join('x')} bricks ${level.brickSize.join('x')}` +
        ` grid ${nkx}x${nky}x${nkz}` +
        (level.store ? '' : ' (computed only, not stored - too close in size to d1)')
    );
  }

  const manifest = buildManifest({
    geometry,
    levels,
    brickSize,
    order,
    spacing,
    transferSyntaxUID: encoding.transferSyntaxUID,
  });

  // The manifest goes last: its presence is what marks the store complete, so an interrupted
  // run leaves no manifest and the next run rebuilds rather than trusting a partial store.
  const manifestStream = await writer.openSeriesStream(BRICK_MANIFEST_FILENAME, {
    path: BRICK_DIRECTORY,
    gzip: false,
  });
  manifestStream.write(Buffer.from(JSON.stringify(manifest, null, 2)));
  await writer.closeStream(manifestStream.streamKey);

  const manifestUri = `series/${seriesUID}/${BRICK_DIRECTORY}/${BRICK_MANIFEST_FILENAME}`;
  const taggedInstances = await tagInstancesWithManifest({
    baseDir,
    studyUID,
    seriesUID,
    instanceMetadataArray,
    reader,
    manifestUri,
  });
  if (taggedInstances > 0) {
    // Rebuild the series level aggregates from the instance files that just changed.
    await seriesSummary(baseDir, studyUID, seriesUID);
  }
  log(`  wrote ${bricksWritten} bricks, tagged ${taggedInstances} instance(s) with ${manifestUri}`);

  return { generated: true, levels, manifest, bricksWritten, encoding };
}

/**
 * Adds the BrickManifestURI private attribute to every instance of the series.
 * @param {Object} params - Tagging parameters
 * @param {string} params.baseDir - Base directory for the DICOMweb structure
 * @param {string} params.studyUID - Study Instance UID
 * @param {string} params.seriesUID - Series Instance UID
 * @param {Object[]} params.instanceMetadataArray - Series metadata
 * @param {Object} params.reader - FileDicomWebReader
 * @param {string} params.manifestUri - URI to record
 * @returns {Promise<number>} - Number of instances whose metadata changed
 */
async function tagInstancesWithManifest({
  baseDir,
  studyUID,
  seriesUID,
  instanceMetadataArray,
  reader,
  manifestUri,
}) {
  let changed = 0;
  for (const seriesLevelMetadata of instanceMetadataArray) {
    const instanceUid = getValue(seriesLevelMetadata, Tags.SOPInstanceUID);
    if (!instanceUid) {
      continue;
    }
    // The instance's own file is the source of truth; the series level copy has rewritten
    // BulkDataURIs and would put series relative paths into the instance file if written back.
    const metadata = await readInstanceMetadata(reader, studyUID, seriesUID, instanceUid);
    if (!metadata) {
      console.warn(`No instance metadata for ${instanceUid}, cannot record the brick manifest URI`);
      continue;
    }
    if (!setBrickManifestUri(metadata, manifestUri)) {
      continue;
    }
    await writeInstanceMetadata({ baseDir, studyUID, seriesUID, instanceUid, metadata });
    changed += 1;
  }
  return changed;
}
