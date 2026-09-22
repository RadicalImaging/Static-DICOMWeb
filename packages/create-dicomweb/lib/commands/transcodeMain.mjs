import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { Tags, uids } from '@radicalimaging/static-wado-util';
import { FileDicomWebReader } from '../instance/FileDicomWebReader.mjs';
import { FileDicomWebWriter } from '../instance/FileDicomWebWriter.mjs';
import { readFrameBytes } from '../instance/readFramePixelData.mjs';
import { seriesSummary } from '../instance/SeriesSummary.mjs';
import {
  JLS_LOSSLESS_TRANSFER_SYNTAX_UID,
  getImageAttributes,
  isUncompressedGrayscale,
  pixelArrayType,
  toImageInfo,
  viewPixelBytes,
} from '../alternates/imageAttributes.mjs';
import {
  readInstanceMetadata,
  setFrameTransferSyntax,
  writeInstanceMetadata,
} from '../alternates/instanceMetadata.mjs';
import { loadFrameCodec } from '../alternates/frameCodec.mjs';

const { getValue } = Tags;

/** Targets `--to` accepts, mapped to their transfer syntax */
const TRANSCODE_TARGETS = {
  jls: JLS_LOSSLESS_TRANSFER_SYNTAX_UID,
};

/**
 * Rewrites a study's primary `frames/` from uncompressed to JPEG-LS lossless, grayscale only.
 *
 * Frames are written to a staging directory beside the instance and moved into place only once
 * every frame of that instance has been encoded, so a failure part way through leaves the
 * original frames untouched rather than half rewritten.
 *
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} options.dicomdir - Base directory of the DICOMweb structure
 * @param {string} [options.seriesUid] - Restrict to one series
 * @param {string} [options.to='jls'] - Target encoding
 * @param {boolean} [options.force] - Re-transcode instances already in the target syntax
 * @returns {Promise<Object>} - Summary of what was transcoded and skipped
 */
export async function transcodeMain(studyUID, options = {}) {
  const { dicomdir, seriesUid, to = 'jls', force = false } = options;

  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }
  if (!studyUID) {
    throw new Error('studyUID is required');
  }
  const targetTransferSyntaxUid = TRANSCODE_TARGETS[to];
  if (!targetTransferSyntaxUid) {
    throw new Error(
      `unsupported --to ${to}; expected one of ${Object.keys(TRANSCODE_TARGETS).join(', ')}`
    );
  }

  const reader = new FileDicomWebReader(dicomdir);
  const codec = await loadFrameCodec();

  const seriesIndex = await reader.readJsonFile(
    reader.getStudyPath(studyUID, { path: 'series' }),
    'index.json'
  );
  if (!Array.isArray(seriesIndex) || seriesIndex.length === 0) {
    throw new Error(`No series found for study ${studyUID}`);
  }
  let seriesList = seriesIndex;
  if (seriesUid) {
    seriesList = seriesIndex.filter(
      series => getValue(series, Tags.SeriesInstanceUID) === seriesUid
    );
    if (seriesList.length === 0) {
      throw new Error(`Series ${seriesUid} not found in study ${studyUID}`);
    }
  }

  const summary = { studyInstanceUID: studyUID, to, series: [] };

  for (const seriesEntry of seriesList) {
    const seriesUID = getValue(seriesEntry, Tags.SeriesInstanceUID);
    if (!seriesUID) {
      console.warn('Series index entry has no SeriesInstanceUID, skipping');
      continue;
    }
    summary.series.push(
      await transcodeSeries({
        baseDir: dicomdir,
        studyUID,
        seriesUID,
        reader,
        codec,
        targetTransferSyntaxUid,
        force,
      })
    );
  }

  const transcoded = summary.series.reduce((sum, entry) => sum + entry.transcoded.length, 0);
  const skipped = summary.series.reduce((sum, entry) => sum + entry.skipped.length, 0);
  console.log(
    `transcode ${studyUID}: rewrote ${transcoded} instance(s) to ${targetTransferSyntaxUid}, skipped ${skipped}`
  );

  return summary;
}

/**
 * Transcodes every eligible instance of one series.
 * @param {Object} params - Series parameters
 * @returns {Promise<Object>} - Per-series summary
 */
async function transcodeSeries({
  baseDir,
  studyUID,
  seriesUID,
  reader,
  codec,
  targetTransferSyntaxUid,
  force,
}) {
  const seriesPath = reader.getSeriesPath(studyUID, seriesUID);
  const instanceMetadataArray = await reader.readJsonFile(seriesPath, 'metadata');
  if (!Array.isArray(instanceMetadataArray) || instanceMetadataArray.length === 0) {
    console.warn(`No series metadata for series ${seriesUID}, skipping`);
    return { seriesInstanceUID: seriesUID, transcoded: [], skipped: [] };
  }

  const transcoded = [];
  const skipped = [];

  for (const seriesLevelMetadata of instanceMetadataArray) {
    const instanceUid = getValue(seriesLevelMetadata, Tags.SOPInstanceUID);
    if (!instanceUid) {
      continue;
    }
    const attributes = getImageAttributes(seriesLevelMetadata);

    // The multipart header on frame 1 is the authority on how the frames were actually
    // written; the metadata's claim can lag behind a previous transcode.
    let sourceTransferSyntaxUid;
    try {
      ({ transferSyntaxUid: sourceTransferSyntaxUid } = await readFrameBytes(
        baseDir,
        studyUID,
        seriesUID,
        seriesLevelMetadata,
        1
      ));
    } catch (error) {
      skipped.push({ instanceUid, reason: `could not read frame 1: ${error.message}` });
      continue;
    }

    if (sourceTransferSyntaxUid === targetTransferSyntaxUid && !force) {
      skipped.push({ instanceUid, reason: `already ${targetTransferSyntaxUid}` });
      continue;
    }

    const eligibility = isUncompressedGrayscale(attributes, sourceTransferSyntaxUid);
    if (!eligibility.ok) {
      skipped.push({ instanceUid, reason: eligibility.reason });
      continue;
    }

    try {
      const result = await transcodeInstance({
        baseDir,
        studyUID,
        seriesUID,
        instanceUid,
        instanceMetadata: seriesLevelMetadata,
        attributes,
        reader,
        codec,
        sourceTransferSyntaxUid,
        targetTransferSyntaxUid,
      });
      transcoded.push({ instanceUid, ...result });
      console.noQuiet(
        `  transcoded ${instanceUid}: ${result.frames} frame(s), ${result.sourceBytes} -> ${result.targetBytes} bytes`
      );
    } catch (error) {
      skipped.push({
        instanceUid,
        reason: `transcode failed, frames left intact: ${error.message}`,
      });
      console.warn(`  ${instanceUid}: ${error.message}`);
    }
  }

  if (transcoded.length > 0) {
    await seriesSummary(baseDir, studyUID, seriesUID);
  }

  return { seriesInstanceUID: seriesUID, transcoded, skipped };
}

/**
 * Transcodes one instance's frames, staging the new frames and swapping them in atomically.
 * @param {Object} params - Instance parameters
 * @returns {Promise<{frames: number, sourceBytes: number, targetBytes: number}>}
 */
async function transcodeInstance({
  baseDir,
  studyUID,
  seriesUID,
  instanceUid,
  instanceMetadata,
  attributes,
  reader,
  codec,
  sourceTransferSyntaxUid,
  targetTransferSyntaxUid,
}) {
  const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUid);
  const instanceDir = path.join(baseDir, instancePath);
  const framesDir = path.join(instanceDir, 'frames');
  const stagingDir = path.join(instanceDir, 'frames.transcoding');

  // A leftover staging directory means a previous attempt died; it is ours, so it goes.
  await fs.promises.rm(stagingDir, { recursive: true, force: true });

  const ArrayType = pixelArrayType(attributes);
  const writer = new FileDicomWebWriter(
    {
      studyInstanceUid: studyUID,
      seriesInstanceUid: seriesUID,
      sopInstanceUid: instanceUid,
      transferSyntaxUid: targetTransferSyntaxUid,
    },
    { baseDir }
  );
  const type = uids[targetTransferSyntaxUid] || uids.default || {};

  let sourceBytes = 0;
  let targetBytes = 0;

  try {
    for (let frameNumber = 1; frameNumber <= attributes.numberOfFrames; frameNumber++) {
      const { bytes, transferSyntaxUid } = await readFrameBytes(
        baseDir,
        studyUID,
        seriesUID,
        instanceMetadata,
        frameNumber
      );
      sourceBytes += bytes.byteLength;
      const raw = await codec.decodeFrameToBytes(bytes, toImageInfo(attributes), transferSyntaxUid);
      const encoded = await codec.encodeFrameFromPixelData(
        viewPixelBytes(ArrayType, raw),
        toImageInfo(attributes),
        targetTransferSyntaxUid
      );
      targetBytes += encoded.byteLength;

      const streamInfo = await writer.openInstanceStream(`${frameNumber}.mht`, {
        path: 'frames.transcoding',
        gzip: false,
        multipart: true,
        boundary: `BOUNDARY_${uuid()}`,
        contentType: `${type.contentType || 'application/octet-stream'};transfer-syntax=${targetTransferSyntaxUid}`,
        streamKey: `transcode:${frameNumber}`,
      });
      streamInfo.write(encoded);
      await writer.closeStream(streamInfo.streamKey);
      const failure = streamInfo.getFailureMessage();
      if (failure) {
        throw new Error(`writing staged frame ${frameNumber}: ${failure}`);
      }
    }

    // Every frame encoded and flushed. Only now does the original get replaced, and by a
    // rename rather than a truncate, so the old frames exist right up to the swap.
    const retiredDir = path.join(instanceDir, 'frames.replaced');
    await fs.promises.rm(retiredDir, { recursive: true, force: true });
    if (fs.existsSync(framesDir)) {
      await fs.promises.rename(framesDir, retiredDir);
    }
    try {
      await fs.promises.rename(stagingDir, framesDir);
    } catch (error) {
      // Put the originals back rather than leaving the instance with no frames at all.
      if (fs.existsSync(retiredDir) && !fs.existsSync(framesDir)) {
        await fs.promises.rename(retiredDir, framesDir);
      }
      throw error;
    }
    await fs.promises.rm(retiredDir, { recursive: true, force: true });
  } catch (error) {
    await fs.promises.rm(stagingDir, { recursive: true, force: true });
    throw error;
  }

  const metadata = await readInstanceMetadata(reader, studyUID, seriesUID, instanceUid);
  if (metadata) {
    if (setFrameTransferSyntax(metadata, targetTransferSyntaxUid)) {
      await writeInstanceMetadata({ baseDir, studyUID, seriesUID, instanceUid, metadata });
    }
  } else {
    console.warn(
      `Transcoded ${instanceUid} but could not read its metadata to record the new transfer syntax`
    );
  }

  console.verbose(
    `transcoded ${instanceUid} from ${sourceTransferSyntaxUid} to ${targetTransferSyntaxUid}`
  );

  return { frames: attributes.numberOfFrames, sourceBytes, targetBytes };
}
