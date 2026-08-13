import fs from 'fs';
import path from 'path';
import { Tags } from '@radicalimaging/static-wado-util';
import { FileDicomWebReader } from '../instance/FileDicomWebReader.mjs';
import { getImageAttributes, uncompressedBytes } from '../alternates/imageAttributes.mjs';
import {
  HTJ2K_LOSSY_RENDITION,
  HTJ2K_RENDITION,
  JLS_RENDITION,
  JLS_THUMBNAIL_RENDITION,
  generateFrameRenditions,
  renditionDimensions,
  resolveRenditions,
} from '../alternates/frameRenditions.mjs';
import { BRICK_DIRECTORY, generateSeriesBrickStore } from '../alternates/brickSeries.mjs';
import { BRICK_ORDERS, BRICK_ORDER_Z_MINOR } from '../alternates/brickPacking.mjs';
import {
  BRICK_CODECS,
  BRICK_CODEC_JLS,
  BRICK_CODEC_NAMES,
  DEFAULT_BRICK_SIZE,
} from '../alternates/brickStore.mjs';
import {
  directorySize,
  formatSummary,
  instanceRenditionSize,
  rendition,
  summarizeStudy,
} from '../alternates/sizeReport.mjs';
import { loadFrameCodec } from '../alternates/frameCodec.mjs';

const { getValue } = Tags;

/**
 * Generates alternate renditions beside an existing DICOMweb tree's `frames/`.
 *
 * `frames/` is never read for anything but its pixels and never written, so the primary
 * rendition stays byte identical whatever this does.
 *
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} options.dicomdir - Base directory of the DICOMweb structure
 * @param {string} [options.seriesUid] - Restrict to one series
 * @param {boolean} [options.jls] - Generate the full resolution JPEG-LS rendition
 * @param {boolean} [options.jlsThumbnail] - Generate the reduced resolution JPEG-LS rendition
 * @param {boolean} [options.htj2k] - Generate the full resolution lossless HTJ2K rendition
 * @param {boolean} [options.htj2kLossy] - Generate the full resolution lossy HTJ2K rendition
 * @param {boolean} [options.brick] - Generate the hierarchical brick store
 * @param {boolean} [options.force] - Regenerate output that already exists
 * @param {string} [options.brickOrder='z-minor'] - Brick row ordering
 * @param {number} [options.brickSize=64] - Brick edge length
 * @param {string} [options.brickCodec='jls'] - Encoding the bricks are written in
 * @param {boolean} [options.json] - Emit the report as JSON on stdout
 * @returns {Promise<Object>} - The report
 */
export async function alternatesMain(studyUID, options = {}) {
  const {
    dicomdir,
    seriesUid,
    jls = false,
    jlsThumbnail = false,
    htj2k = false,
    htj2kLossy = false,
    brick = false,
    force = false,
    brickOrder = BRICK_ORDER_Z_MINOR,
    brickSize = DEFAULT_BRICK_SIZE,
    brickCodec = BRICK_CODEC_JLS,
    json = false,
  } = options;

  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }
  if (!studyUID) {
    throw new Error('studyUID is required');
  }
  // The five outputs are independent and can all be asked for in one pass, which is what makes
  // a comparison across them fair: every one is built from the same decode of the same frames.
  const renditionNames = [
    ...(jls ? [JLS_RENDITION] : []),
    ...(jlsThumbnail ? [JLS_THUMBNAIL_RENDITION] : []),
    ...(htj2k ? [HTJ2K_RENDITION] : []),
    ...(htj2kLossy ? [HTJ2K_LOSSY_RENDITION] : []),
  ];
  if (renditionNames.length === 0 && !brick) {
    throw new Error(
      'nothing to do: pass at least one of --jls, --jls-thumbnail, --htj2k, --htj2k-lossy or --brick'
    );
  }
  if (!BRICK_ORDERS.includes(brickOrder)) {
    throw new Error(
      `unsupported --brick-order ${brickOrder}; expected one of ${BRICK_ORDERS.join(', ')}`
    );
  }
  if (!BRICK_CODEC_NAMES.includes(brickCodec)) {
    throw new Error(
      `unsupported --brick-codec ${brickCodec}; expected one of ${BRICK_CODEC_NAMES.join(', ')}`
    );
  }

  // With --json, stdout carries exactly one JSON document so it can be collected across a
  // corpus without scraping; the human readable progress and summary go to stderr.
  const log = json ? (...args) => console.error(...args) : (...args) => console.log(...args);

  const reader = new FileDicomWebReader(dicomdir);
  const codec = await loadFrameCodec();

  const seriesList = await selectSeries(reader, studyUID, seriesUid);
  log(`Generating alternates for ${seriesList.length} series in study ${studyUID}`);

  const seriesReports = [];
  const failures = [];
  for (const seriesEntry of seriesList) {
    const seriesUID = getValue(seriesEntry, Tags.SeriesInstanceUID);
    let report;
    try {
      report = await processSeries({
        baseDir: dicomdir,
        studyUID,
        seriesEntry,
        reader,
        codec,
        renditionNames,
        brick,
        force,
        brickOrder,
        brickSize,
        brickCodec,
        log,
      });
    } catch (error) {
      // A study is a mixture of acquisitions and one of them failing should not cost the
      // rest, so the run continues and the failure is reported at the end instead.
      const message = error?.message ?? String(error);
      failures.push({ seriesInstanceUID: seriesUID, error: message });
      console.error(`series ${seriesUID}: failed - ${message}`);
    }
    if (report) {
      seriesReports.push(report);
    }
  }

  const totals = summarizeStudy(seriesReports);
  const result = {
    studyInstanceUID: studyUID,
    renditions: renditionNames,
    brickOrder,
    brickSize,
    brickCodec,
    brickTransferSyntaxUID: BRICK_CODECS[brickCodec].transferSyntaxUID,
    series: seriesReports,
    failures,
    total: totals,
  };

  for (const line of formatSummary(seriesReports, totals)) {
    log(line);
  }
  for (const failure of failures) {
    log(`  FAILED ${failure.seriesInstanceUID}: ${failure.error}`);
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}

/**
 * Reads the series index and narrows it to the requested series.
 * @param {Object} reader - FileDicomWebReader
 * @param {string} studyUID - Study Instance UID
 * @param {string} [seriesUid] - Series to restrict to
 * @returns {Promise<Object[]>} - Series query entries
 */
async function selectSeries(reader, studyUID, seriesUid) {
  const seriesIndex = await reader.readJsonFile(
    reader.getStudyPath(studyUID, { path: 'series' }),
    'index.json'
  );

  if (!seriesIndex || !Array.isArray(seriesIndex) || seriesIndex.length === 0) {
    throw new Error(`No series found for study ${studyUID}`);
  }

  if (!seriesUid) {
    return seriesIndex;
  }

  const selected = seriesIndex.filter(
    series => getValue(series, Tags.SeriesInstanceUID) === seriesUid
  );
  if (selected.length === 0) {
    throw new Error(`Series ${seriesUid} not found in study ${studyUID}`);
  }
  return selected;
}

/**
 * Generates the requested renditions for one series and measures the result.
 * @param {Object} params - Processing parameters
 * @returns {Promise<Object|undefined>} - The series report, or undefined when unreadable
 */
async function processSeries({
  baseDir,
  studyUID,
  seriesEntry,
  reader,
  codec,
  renditionNames,
  brick,
  force,
  brickOrder,
  brickSize,
  brickCodec,
  log,
}) {
  const seriesUID = getValue(seriesEntry, Tags.SeriesInstanceUID);
  if (!seriesUID) {
    console.warn('Series index entry has no SeriesInstanceUID, skipping');
    return undefined;
  }

  const seriesPath = reader.getSeriesPath(studyUID, seriesUID);
  const instanceMetadataArray = await reader.readJsonFile(seriesPath, 'metadata');
  if (!Array.isArray(instanceMetadataArray) || instanceMetadataArray.length === 0) {
    console.warn(`No series metadata for series ${seriesUID}, skipping`);
    return undefined;
  }

  const attributes = getImageAttributes(instanceMetadataArray[0]);
  const modality = getValue(seriesEntry, Tags.Modality);
  log(`series ${seriesUID} (${modality ?? '??'}), ${instanceMetadataArray.length} instance(s)`);

  const skipped = [];
  let brickResult;

  if (renditionNames.length > 0) {
    const renditionResult = await generateFrameRenditions({
      baseDir,
      studyUID,
      seriesUID,
      instanceMetadataArray,
      reader,
      codec,
      renditions: renditionNames,
      force,
      log,
    });
    for (const instanceSkip of renditionResult.skippedInstances) {
      skipped.push({
        rendition: renditionNames.join('/'),
        reason: `instance ${instanceSkip.instanceUid}: ${instanceSkip.reason}`,
      });
    }
    log(
      `  wrote ${renditionNames.map(name => `${renditionResult.written[name]} ${name}`).join(', ')} frames ` +
        `(already present: ${renditionNames.map(name => `${renditionResult.skipped[name]} ${name}`).join(', ')})`
    );
  }

  if (brick) {
    brickResult = await generateSeriesBrickStore({
      baseDir,
      studyUID,
      seriesUID,
      instanceMetadataArray,
      reader,
      codec,
      brickSize,
      order: brickOrder,
      brickCodec,
      force,
      log,
    });
    if (!brickResult.generated) {
      skipped.push({ rendition: BRICK_DIRECTORY, reason: brickResult.reason });
      log(`  brick: skipped - ${brickResult.reason}`);
    }
  }

  return measureSeries({
    baseDir,
    studyUID,
    seriesUID,
    modality,
    attributes,
    instanceMetadataArray,
    reader,
    renditionNames,
    brick,
    brickLevels: brickResult?.levels,
    skipped,
  });
}

/**
 * Measures what is on disk for a series and turns it into a report.
 *
 * Ratios are computed against the raw voxel count of each rendition's own dimensions, so a
 * quarter resolution thumbnail is not credited with a 16x ratio it did not earn.
 *
 * @param {Object} params - Measurement parameters
 * @returns {Promise<Object>} - The series report
 */
async function measureSeries({
  baseDir,
  studyUID,
  seriesUID,
  modality,
  attributes,
  instanceMetadataArray,
  reader,
  renditionNames,
  brick,
  brickLevels,
  skipped,
}) {
  const seriesDir = path.join(baseDir, reader.getSeriesPath(studyUID, seriesUID));
  const instanceUids = instanceMetadataArray
    .map(metadata => getValue(metadata, Tags.SOPInstanceUID))
    .filter(Boolean);
  const totalFrames = instanceMetadataArray.reduce(
    (sum, metadata) => sum + getImageAttributes(metadata).numberOfFrames,
    0
  );
  const { rows, columns, samplesPerPixel, bitsAllocated } = attributes;

  const renditions = [];

  const framesBytes = await instanceRenditionSize(seriesDir, instanceUids, 'frames');
  renditions.push(
    rendition({
      name: 'frames',
      bytes: framesBytes,
      uncompressedBytes: uncompressedBytes({
        rows,
        columns,
        frames: totalFrames,
        bitsAllocated,
        samplesPerPixel,
      }),
      dimensions: `${columns}x${rows}x${totalFrames}`,
    })
  );

  // Each rendition is measured at its own dimensions, so a quarter resolution thumbnail is not
  // credited with the 16x ratio that comparing it against full resolution voxels would give it.
  for (const entry of resolveRenditions(renditionNames)) {
    const bytes = await instanceRenditionSize(seriesDir, instanceUids, entry.name);
    const size = renditionDimensions(attributes, entry);
    renditions.push(
      rendition({
        name: entry.name,
        bytes,
        uncompressedBytes: uncompressedBytes({
          rows: size.rows,
          columns: size.columns,
          frames: totalFrames,
          bitsAllocated,
          samplesPerPixel,
        }),
        dimensions: `${size.columns}x${size.rows}x${totalFrames}`,
        lossy: entry.lossy,
      })
    );
  }

  let brickOverheadOfFrames = null;
  if (brick && brickLevels?.length) {
    const brickDir = path.join(seriesDir, BRICK_DIRECTORY);
    const levels = [];
    let bytes = 0;
    let uncompressed = 0;
    for (const level of brickLevels) {
      const levelBytes = await directorySize(path.join(brickDir, level.name));
      const [sizeX, sizeY, sizeZ] = level.size;
      const levelUncompressed = uncompressedBytes({
        rows: sizeY,
        columns: sizeX,
        frames: sizeZ,
        bitsAllocated,
        samplesPerPixel,
      });
      levels.push({
        name: level.name,
        size: level.size,
        bricks: level.bricks,
        bytes: levelBytes,
        uncompressedBytes: levelUncompressed,
        ratio: levelBytes > 0 ? levelUncompressed / levelBytes : null,
      });
      bytes += levelBytes;
      uncompressed += levelUncompressed;
    }
    // The manifest is part of the store's cost, small as it is.
    bytes += await fileSize(path.join(brickDir, 'manifest.json'));
    renditions.push(
      rendition({
        name: BRICK_DIRECTORY,
        bytes,
        uncompressedBytes: uncompressed,
        dimensions: brickLevels[0].size.join('x'),
        levels,
      })
    );
    brickOverheadOfFrames = framesBytes > 0 ? bytes / framesBytes : null;
  }

  const seriesBytes = renditions.reduce((sum, entry) => sum + entry.bytes, 0);
  const seriesUncompressed = renditions.reduce((sum, entry) => sum + entry.uncompressedBytes, 0);

  return {
    seriesInstanceUID: seriesUID,
    modality,
    dimensions: `${columns}x${rows}x${totalFrames}`,
    instances: instanceUids.length,
    frames: totalFrames,
    bitsAllocated: attributes.bitsAllocated,
    renditions,
    brickOverheadOfFrames,
    bytes: seriesBytes,
    uncompressedBytes: seriesUncompressed,
    ratio: seriesBytes > 0 ? seriesUncompressed / seriesBytes : null,
    skipped,
  };
}

/**
 * Size of one file, or zero when it is absent.
 * @param {string} filepath - Absolute file path
 * @returns {Promise<number>} - Bytes
 */
async function fileSize(filepath) {
  try {
    return (await fs.promises.stat(filepath)).size;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}
