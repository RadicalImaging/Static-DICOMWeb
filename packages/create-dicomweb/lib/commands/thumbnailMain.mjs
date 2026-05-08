import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { pathToFileURL } from 'url';
import { DicomWebStream } from '../instance/DicomWebStream.mjs';
import { FileDicomWebWriter } from '../instance/FileDicomWebWriter.mjs';
import {
  isS3OutputUri,
  parseS3OutputUri,
  getBunS3ClientForBucket,
  joinS3ObjectKey,
  thumbnailRelativeKey,
  putS3ThumbnailJpeg,
  s3ObjectExists,
} from '../instance/s3ThumbnailOutput.mjs';
import {
  Tags,
  qidoFilter,
  handleHomeRelative,
  execSpawn,
} from '@radicalimaging/static-wado-util';
import StaticWado, {
  getVideoFileExtensionForTransferSyntaxUid,
  isVideoTransferSyntaxUid,
} from '@radicalimaging/static-wado-creator';

const { getValue } = Tags;

/** Explicit VR Little Endian — default when no transfer syntax is found in headers or metadata */
const DEFAULT_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.1';

/**
 * Transfer syntax from instance metadata.
 * Tag {@link Tags.AvailableTransferSyntaxUID} (00083002) is only meaningful for **single-part** bulk
 * storage (e.g. raw compressed files where path/extension implies a TS family); see {@link resolveThumbnailTransferSyntaxUid}.
 *
 * @param {Object} metadata
 * @param {{ includeAvailableTransferSyntax?: boolean }} [opts]
 */
function getTransferSyntaxFromInstanceMetadata(metadata, { includeAvailableTransferSyntax = true } = {}) {
  if (includeAvailableTransferSyntax) {
    const available = getValue(metadata, Tags.AvailableTransferSyntaxUID);
    if (available) return available;
  }
  const hex = getValue(metadata, Tags.TransferSyntaxUID);
  if (hex) return hex;
  const nat = metadata?.TransferSyntaxUID;
  if (nat?.Value?.[0]) return nat.Value[0];
  if (typeof nat === 'string') return nat;
  return undefined;
}

/**
 * Inner multipart Content-Type `transfer-syntax=` overrides metadata (including 00083002).
 * {@link Tags.AvailableTransferSyntaxUID} applies only when bulk data was **not** multipart/related-wrapped.
 *
 * @param {Object} bulkData - Result of {@link DicomWebReader.readBulkData}
 * @param {Object} pixelData - PixelData element from instance metadata
 * @param {Object} instanceMetadata
 * @returns {{ transferSyntaxUid: string | undefined, resolutionNote: string }}
 */
function resolveThumbnailTransferSyntaxUid(bulkData, pixelData, instanceMetadata) {
  const innerUid = bulkData.transferSyntaxUid;
  if (bulkData.transferSyntaxFromInnerPart && innerUid) {
    return { transferSyntaxUid: innerUid, resolutionNote: 'inner multipart Content-Type transfer-syntax' };
  }

  if (bulkData.wasMultipart) {
    const ts =
      innerUid ||
      pixelData.transferSyntaxUid ||
      getTransferSyntaxFromInstanceMetadata(instanceMetadata, { includeAvailableTransferSyntax: false });
    return {
      transferSyntaxUid: ts,
      resolutionNote: 'multipart bulk without inner transfer-syntax (tag 00083002 not applied)',
    };
  }

  const ts =
    innerUid ||
    pixelData.transferSyntaxUid ||
    getTransferSyntaxFromInstanceMetadata(instanceMetadata, { includeAvailableTransferSyntax: true });
  return {
    transferSyntaxUid: ts,
    resolutionNote: 'single-part bulk (may use tag 00083002 AvailableTransferSyntaxUID)',
  };
}

function getMetadataTransferSyntaxForRouting(metadata) {
  return getTransferSyntaxFromInstanceMetadata(metadata, { includeAvailableTransferSyntax: true });
}

function hasPhotometricInterpretation(metadata) {
  return Boolean(getValue(metadata, Tags.PhotometricInterpretation));
}

function isSegInstance(metadata) {
  return getValue(metadata, Tags.Modality) === 'SEG';
}

/**
 * @returns {{ ok: boolean, reason?: string, metaTs?: string }}
 */
function thumbnailInstancePrecheck(metadata, force) {
  const metaTs = getMetadataTransferSyntaxForRouting(metadata);
  const isVid = metaTs && isVideoTransferSyntaxUid(metaTs);
  if (!isVid && !hasPhotometricInterpretation(metadata)) {
    return { ok: false, reason: 'missing PhotometricInterpretation (00280004)', metaTs };
  }
  if (isSegInstance(metadata) && !force) {
    return { ok: false, reason: 'Modality is SEG (use --force to thumbnail)', metaTs };
  }
  return { ok: true, metaTs };
}

async function loadVideoBytesFromPixelBulk(reader, studyUID, seriesUID, instanceMetadata, frameNumber = 1) {
  const sopUID = getValue(instanceMetadata, Tags.SOPInstanceUID);
  const pixelData = instanceMetadata[Tags.PixelData];
  if (!pixelData?.BulkDataURI) {
    console.verbose('[thumbnail] video bulk fallback: no PixelData BulkDataURI');
    return null;
  }
  try {
    const bulkData = await reader.readBulkData(
      studyUID,
      seriesUID,
      pixelData.BulkDataURI,
      frameNumber,
      sopUID
    );
    if (!bulkData?.binaryData) return null;
    const bd = bulkData.binaryData;
    const buf = bd instanceof ArrayBuffer ? Buffer.from(bd) : Buffer.from(bd);
    return buf.byteLength ? buf : null;
  } catch (e) {
    console.verbose('[thumbnail] video bulk fallback read failed', e);
    return null;
  }
}

/**
 * Stream `instances/.../rendered/index.<ext>` to disk (avoids holding full clip in JS heap).
 * @returns {Promise<boolean>}
 */
async function streamRenderedVideoToFile(reader, studyUID, seriesUID, instanceUID, ext, destPath) {
  const filename = path.posix.join('rendered', `index.${ext}`);
  let stream;
  try {
    stream = await reader.openInstanceInputStream(studyUID, seriesUID, instanceUID, filename);
  } catch {
    return false;
  }
  if (!stream) return false;
  const out = fs.createWriteStream(destPath);
  try {
    await pipeline(stream, out);
    return true;
  } catch (e) {
    console.verbose('[thumbnail] stream rendered video to disk failed', e);
    try {
      await fs.promises.unlink(destPath);
    } catch {
      /* ignore */
    }
    return false;
  }
}

async function ffmpegExtractFirstFrameToJpeg(videoPath, jpegOutPath) {
  const code = await execSpawn(
    `ffmpeg -hide_banner -loglevel error -i "${videoPath}" -y -f image2 -frames:v 1 -update 1 "${jpegOutPath}"`
  );
  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}`);
  }
}

/**
 * Video transfer syntax: prefer `rendered/index.<ext>`; if missing, read encapsulated video from PixelData bulk (same bits as VideoWriter).
 * @returns {Promise<Buffer|null>} JPEG bytes, or null if not a video TS / nothing readable
 */
async function tryThumbnailFromRenderedVideo(
  reader,
  studyUID,
  seriesUID,
  instanceUID,
  instanceMetadata,
  frameNumber = 1
) {
  const metaTs = getMetadataTransferSyntaxForRouting(instanceMetadata);
  if (!metaTs || !isVideoTransferSyntaxUid(metaTs)) return null;

  const ext = getVideoFileExtensionForTransferSyntaxUid(metaTs);
  if (!ext) return null;

  console.verbose('[thumbnail] video TS — trying rendered/index.' + ext, { metaTs });

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cdw-thumb-'));
  const vidPath = path.join(tmpDir, `video.${ext}`);
  const jpgPath = path.join(tmpDir, 'thumb.jpg');
  try {
    let haveVideo = await streamRenderedVideoToFile(reader, studyUID, seriesUID, instanceUID, ext, vidPath);
    if (!haveVideo) {
      console.verbose('[thumbnail] video TS — no rendered stream; PixelData bulk frame', { frameNumber });
      const vidBuf = await loadVideoBytesFromPixelBulk(reader, studyUID, seriesUID, instanceMetadata, frameNumber);
      if (!vidBuf?.length) return null;
      await fs.promises.writeFile(vidPath, vidBuf);
    }

    await ffmpegExtractFirstFrameToJpeg(vidPath, jpgPath);
    return await fs.promises.readFile(jpgPath);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function persistThumbnailJpeg({
  jpegBuffer,
  dicomdir,
  outputDicomdir,
  studyUID,
  seriesUID,
  instanceUID,
  level,
  filename,
  transferSyntaxUidForWriter,
}) {
  const outBase = outputRoot(outputDicomdir, dicomdir);
  const useS3 = isS3OutputUri(outBase);

  let s3Client;
  let s3Bucket;
  let s3KeyPrefix;
  if (useS3) {
    const parsed = parseS3OutputUri(outBase);
    s3Bucket = parsed.bucket;
    s3KeyPrefix = parsed.keyPrefix;
    s3Client = await getBunS3ClientForBucket(s3Bucket);
  }

  const writer = useS3
    ? null
    : new FileDicomWebWriter(
        {
          studyInstanceUid: studyUID,
          seriesInstanceUid: seriesUID,
          sopInstanceUid: instanceUID,
          transferSyntaxUid: transferSyntaxUidForWriter,
        },
        { baseDir: outBase }
      );

  const buf = Buffer.from(jpegBuffer);

  if (useS3) {
    const relKey = thumbnailRelativeKey(level, studyUID, seriesUID, instanceUID, filename);
    const key = joinS3ObjectKey(s3KeyPrefix, relKey);
    await putS3ThumbnailJpeg(s3Client, key, buf, s3Bucket);
  } else {
    let thumbnailStreamInfo;
    if (level === 'study') {
      thumbnailStreamInfo = await writer.openStudyStream(filename, { gzip: false });
    } else if (level === 'series') {
      thumbnailStreamInfo = await writer.openSeriesStream(filename, { gzip: false });
    } else {
      thumbnailStreamInfo = await writer.openInstanceStream(filename, { gzip: false });
    }

    thumbnailStreamInfo.stream.write(buf);
    await writer.closeStream(thumbnailStreamInfo.streamKey);
  }

  logThumbnailWritten({
    dicomdir,
    outputDicomdir,
    studyUID,
    seriesUID,
    instanceUID,
    level,
    filename,
  });
}

function parseSelectorToQuery(selector) {
  const params = new URLSearchParams(selector);
  const query = {};
  for (const [key, value] of params.entries()) {
    query[key] = value;
  }
  return query;
}

function asStudyList(studiesValue) {
  if (Array.isArray(studiesValue)) return studiesValue;
  if (studiesValue && typeof studiesValue === 'object') return [studiesValue];
  return [];
}

/**
 * PS3.x-style one-line warning when a single thumbnail is skipped (decode/render/write).
 * @param {Object} p
 * @param {string} p.studyUID
 * @param {string} p.seriesUID
 * @param {string} p.instanceUID
 * @param {string} p.level
 * @param {unknown} p.error
 */
function warnThumbnailSkippedDicom({ studyUID, seriesUID, instanceUID, level, error }) {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(
    `*** DICOM warning [THUMBNAIL_SKIP] StudyInstanceUID=${studyUID} SeriesInstanceUID=${seriesUID} SOPInstanceUID=${instanceUID} Level=${level}: ${reason}`
  );
  if (error instanceof Error && error.stack) {
    console.verbose('[thumbnail] skip stack', error.stack);
  }
}

/**
 * Resolved output root for thumbnails (local path or s3:// URI).
 */
function outputRoot(outputDicomdir, dicomdir) {
  return outputDicomdir || dicomdir;
}

/**
 * Browser-oriented URL for logs: when output is S3, prefer {@link dicomdir} as HTTPS prefix so the path
 * matches where reads are served; fall back to `s3://` only if there is no HTTP retrieve base.
 * Otherwise same as before: https from dicomdir, or file:// for local output.
 * @param {Object} p
 */
function formatThumbnailOutputHref({ dicomdir, outputDicomdir, studyUID, seriesUID, instanceUID, level, filename }) {
  const rel = thumbnailRelativeKey(level, studyUID, seriesUID, instanceUID, filename);
  const outBase = outputRoot(outputDicomdir, dicomdir);

  if (isS3OutputUri(outBase)) {
    const retrieveBase = String(dicomdir ?? '').trim();
    if (/^https?:\/\//i.test(retrieveBase)) {
      const base = retrieveBase.replace(/\/?$/, '/');
      return new URL(rel, base).href;
    }
    const { bucket, keyPrefix } = parseS3OutputUri(outBase);
    const key = joinS3ObjectKey(keyPrefix, rel);
    return `s3://${bucket}/${key}`;
  }

  const dicomdirStr = String(dicomdir ?? '').trim();
  if (/^https?:\/\//i.test(dicomdirStr)) {
    const base = dicomdirStr.replace(/\/?$/, '/');
    return new URL(rel, base).href;
  }
  const root = handleHomeRelative(outBase);
  const fullPath = path.normalize(path.join(root, ...rel.split('/').filter(Boolean)));
  return pathToFileURL(fullPath).href;
}

/**
 * In non-quiet mode, print where the thumbnail was written (retrieve HTTPS when S3 output + HTTP dicomdir).
 */
function logThumbnailWritten(params) {
  console.noQuiet('Thumbnail written:', formatThumbnailOutputHref(params));
}

/**
 * In non-quiet mode, print that the thumbnail already exists at the same URL shape as {@link logThumbnailWritten}.
 */
function logThumbnailAlreadyExists(params) {
  console.noQuiet('Already exists:', formatThumbnailOutputHref(params));
}

/**
 * True if a thumbnail file/object is already present at the output root (filesystem or S3).
 * @param {Object} p
 * @param {'study'|'series'|'instance'} p.level
 */
async function thumbnailExistsAtOutput({ outputDicomdir, dicomdir, studyUID, seriesUID, instanceUID, level, filename }) {
  const rel = thumbnailRelativeKey(level, studyUID, seriesUID, instanceUID, filename);
  const outBase = outputRoot(outputDicomdir, dicomdir);

  if (isS3OutputUri(outBase)) {
    const { bucket, keyPrefix } = parseS3OutputUri(outBase);
    const key = joinS3ObjectKey(keyPrefix, rel);
    const client = await getBunS3ClientForBucket(bucket);
    return s3ObjectExists(client, key);
  }

  const root = handleHomeRelative(outBase);
  const fullPath = path.normalize(path.join(root, ...rel.split('/').filter(Boolean)));
  return fs.existsSync(fullPath);
}

/**
 * Reads pixel data from instance metadata
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {Object} instanceMetadata - Instance metadata object
 * @param {number} frameNumber - Frame number (1-based, default: 1)
 * @returns {Promise<Object>} - Object with binaryData, transferSyntaxUid, and contentType
 */
async function readPixelData(reader, studyUID, seriesUID, instanceMetadata, frameNumber = 1) {
  const sopUID = getValue(instanceMetadata, Tags.SOPInstanceUID);
  const pixelDataTag = Tags.PixelData;
  const pixelData = instanceMetadata[pixelDataTag];

  if (!pixelData) {
    throw new Error('No PixelData found in instance metadata');
  }

  const bulkDataURI = pixelData.BulkDataURI;
  if (!bulkDataURI) {
    throw new Error('No BulkDataURI found in PixelData');
  }

  console.verbose('[thumbnail] readPixelData request', {
    studyUID,
    seriesUID,
    sopInstanceUID: sopUID,
    frameNumber,
    bulkDataURI: typeof bulkDataURI === 'string' ? bulkDataURI.slice(0, 120) : bulkDataURI,
  });

  const bulkData = await reader.readBulkData(
    studyUID,
    seriesUID,
    bulkDataURI,
    frameNumber,
    sopUID
  );

  if (!bulkData) {
    throw new Error(`Failed to read bulk data for frame ${frameNumber}`);
  }

  const { transferSyntaxUid: resolvedTs, resolutionNote } = resolveThumbnailTransferSyntaxUid(
    bulkData,
    pixelData,
    instanceMetadata
  );
  let transferSyntaxUid = resolvedTs;

  const fromMetaWithAvailable = getTransferSyntaxFromInstanceMetadata(instanceMetadata, {
    includeAvailableTransferSyntax: true,
  });
  const fromMetaNoAvailable = getTransferSyntaxFromInstanceMetadata(instanceMetadata, {
    includeAvailableTransferSyntax: false,
  });

  if (!transferSyntaxUid) {
    console.warn(
      `[thumbnail] No transfer syntax for instance ${sopUID} (${resolutionNote}); using default ${DEFAULT_TRANSFER_SYNTAX_UID}. If decoding fails, inspect responses with -v.`
    );
    transferSyntaxUid = DEFAULT_TRANSFER_SYNTAX_UID;
  }

  console.verbose('[thumbnail] readPixelData resolved', {
    sopInstanceUID: sopUID,
    transferSyntaxUid,
    resolutionNote,
    wasMultipart: !!bulkData.wasMultipart,
    transferSyntaxFromInnerPart: !!bulkData.transferSyntaxFromInnerPart,
    sources: {
      bulkDataResponse: bulkData.transferSyntaxUid ?? '(none)',
      pixelDataTag: pixelData.transferSyntaxUid ?? '(none)',
      metadata00083002: fromMetaWithAvailable ?? '(none)',
      metadata00020010only: fromMetaNoAvailable ?? '(none)',
    },
    contentType: bulkData.contentType,
    byteLength:
      bulkData.binaryData instanceof ArrayBuffer
        ? bulkData.binaryData.byteLength
        : bulkData.binaryData?.length,
  });

  return {
    binaryData: bulkData.binaryData,
    transferSyntaxUid,
    contentType: bulkData.contentType,
  };
}

async function writeThumbnailForTarget({
  reader,
  dicomdir,
  outputDicomdir,
  studyUID,
  seriesUID,
  instanceMetadata,
  frameNumber,
  level,
  force,
  thumbnailFilename = 'thumbnail',
}) {
  const instanceUID = getValue(instanceMetadata, Tags.SOPInstanceUID);
  if (!instanceUID) {
    throw new Error('Could not extract SOPInstanceUID from instance metadata');
  }

  console.verbose('[thumbnail] writeThumbnailForTarget', {
    level,
    studyUID,
    seriesUID,
    instanceUID,
    frameNumber,
    thumbnailFilename,
    outputBase: outputRoot(outputDicomdir, dicomdir),
    force: !!force,
  });

  const pre = thumbnailInstancePrecheck(instanceMetadata, force);
  if (!pre.ok) {
    warnThumbnailSkippedDicom({
      studyUID,
      seriesUID,
      instanceUID,
      level,
      error: new Error(pre.reason),
    });
    return;
  }

  if (!force) {
    try {
      const exists = await thumbnailExistsAtOutput({
        outputDicomdir,
        dicomdir,
        studyUID,
        seriesUID,
        instanceUID,
        level,
        filename: thumbnailFilename,
      });
      if (exists) {
        logThumbnailAlreadyExists({
          dicomdir,
          outputDicomdir,
          studyUID,
          seriesUID,
          instanceUID,
          level,
          filename: thumbnailFilename,
        });
        return;
      }
    } catch (error) {
      console.verbose('[thumbnail] could not check existing thumbnail; will attempt generation', error);
    }
  }

  const metaTs = pre.metaTs;
  if (metaTs && isVideoTransferSyntaxUid(metaTs)) {
    try {
      const jpegBuf = await tryThumbnailFromRenderedVideo(
        reader,
        studyUID,
        seriesUID,
        instanceUID,
        instanceMetadata,
        frameNumber
      );
      if (jpegBuf?.length) {
        await persistThumbnailJpeg({
          jpegBuffer: jpegBuf,
          dicomdir,
          outputDicomdir,
          studyUID,
          seriesUID,
          instanceUID,
          level,
          filename: thumbnailFilename,
          transferSyntaxUidForWriter: DEFAULT_TRANSFER_SYNTAX_UID,
        });
        return;
      }
      warnThumbnailSkippedDicom({
        studyUID,
        seriesUID,
        instanceUID,
        level,
        error: new Error(
          'Video transfer syntax but neither rendered/index.<ext> nor PixelData bulk could be read for ffmpeg'
        ),
      });
    } catch (error) {
      warnThumbnailSkippedDicom({ studyUID, seriesUID, instanceUID, level, error });
    }
    return;
  }

  try {
    const pixelData = await readPixelData(reader, studyUID, seriesUID, instanceMetadata, frameNumber);
    const transferSyntaxUid = pixelData.transferSyntaxUid;

    let imageFrame = pixelData.binaryData;
    if (imageFrame instanceof ArrayBuffer) {
      imageFrame = new Uint8Array(imageFrame);
    }

    await StaticWado.internalGenerateImage(imageFrame, null, instanceMetadata, transferSyntaxUid, async buffer => {
      if (!buffer) {
        console.warn(
          `*** DICOM warning [THUMBNAIL_SKIP] StudyInstanceUID=${studyUID} SeriesInstanceUID=${seriesUID} SOPInstanceUID=${instanceUID} Level=${level}: No thumbnail buffer generated after render`
        );
        return;
      }
      await persistThumbnailJpeg({
        jpegBuffer: buffer,
        dicomdir,
        outputDicomdir,
        studyUID,
        seriesUID,
        instanceUID,
        level,
        filename: thumbnailFilename,
        transferSyntaxUidForWriter: transferSyntaxUid,
      });
    });
  } catch (error) {
    warnThumbnailSkippedDicom({ studyUID, seriesUID, instanceUID, level, error });
  }
}

async function resolveStudyUIDs(reader, studySelector) {
  if (!studySelector || studySelector === 'true') {
    if (typeof reader.queryStudies === 'function') {
      const studies = await reader.queryStudies('true');
      return asStudyList(studies).map(study => getValue(study, Tags.StudyInstanceUID)).filter(Boolean);
    }
    const studies = await reader.readJsonFile('studies', 'index.json');
    return asStudyList(studies).map(study => getValue(study, Tags.StudyInstanceUID)).filter(Boolean);
  }

  if (studySelector.includes('=')) {
    if (typeof reader.queryStudies === 'function') {
      const studies = await reader.queryStudies(studySelector);
      return asStudyList(studies).map(study => getValue(study, Tags.StudyInstanceUID)).filter(Boolean);
    }
    const studies = asStudyList(await reader.readJsonFile('studies', 'index.json'));
    const filtered = qidoFilter(studies, parseSelectorToQuery(studySelector));
    return filtered.map(study => getValue(study, Tags.StudyInstanceUID)).filter(Boolean);
  }

  return [studySelector];
}

async function generateForStudy(studyUID, options = {}) {
  const {
    reader,
    dicomdir,
    outputDicomdir,
    seriesUid,
    instanceUid,
    frameNumbers,
    frameNumber,
    allThumbnails,
    seriesThumbnail,
    force,
  } = options;
  const framesToProcess = frameNumbers || (frameNumber ? [frameNumber] : [1]);

  console.verbose('[thumbnail] generateForStudy start', {
    studyUID,
    allThumbnails: !!allThumbnails,
    seriesThumbnail: !!seriesThumbnail,
    seriesUid: seriesUid ?? '(any)',
    instanceUid: instanceUid ?? '(default)',
    framesToProcess,
    dicomdir,
    outputDicomdir: outputDicomdir ?? '(same as dicomdir)',
  });

  const seriesIndex = await reader.readJsonFile(
    reader.getStudyPath(studyUID, { path: 'series' }),
    'index.json'
  );
  if (!seriesIndex || !Array.isArray(seriesIndex) || seriesIndex.length === 0) {
    throw new Error(`No series found for study ${studyUID}`);
  }

  console.verbose('[thumbnail] series index length', seriesIndex.length);

  let seriesToProcess = seriesIndex;
  if (seriesUid) {
    seriesToProcess = seriesIndex.filter(series => getValue(series, Tags.SeriesInstanceUID) === seriesUid);
    if (!seriesToProcess.length) throw new Error(`Series ${seriesUid} not found in study ${studyUID}`);
  }

  if (allThumbnails) {
    const seriesMetadataCache = [];
    for (const seriesItem of seriesToProcess) {
      const targetSeriesUID = getValue(seriesItem, Tags.SeriesInstanceUID);
      if (!targetSeriesUID) continue;
      const seriesMetadata = await reader.readJsonFile(reader.getSeriesPath(studyUID, targetSeriesUID), 'metadata');
      if (!Array.isArray(seriesMetadata) || !seriesMetadata.length) continue;
      seriesMetadataCache.push({ seriesUid: targetSeriesUID, metadata: seriesMetadata });
      for (const metadata of seriesMetadata) {
        const numberOfFrames = getValue(metadata, Tags.NumberOfFrames) || 1;
        await writeThumbnailForTarget({
          reader,
          dicomdir,
          outputDicomdir,
          studyUID,
          seriesUID: targetSeriesUID,
          instanceMetadata: metadata,
          frameNumber: Math.ceil(numberOfFrames / 2),
          level: 'instance',
          force,
        });
      }
      const middle = seriesMetadata[Math.floor(seriesMetadata.length / 2)];
      const middleFrames = getValue(middle, Tags.NumberOfFrames) || 1;
      await writeThumbnailForTarget({
        reader,
        dicomdir,
        outputDicomdir,
        studyUID,
        seriesUID: targetSeriesUID,
        instanceMetadata: middle,
        frameNumber: Math.ceil(middleFrames / 2),
        level: 'series',
        force,
      });
    }
    if (!seriesMetadataCache.length) return;
    const middleSeries = seriesMetadataCache[Math.floor(seriesMetadataCache.length / 2)];
    const middleInstance = middleSeries.metadata[Math.floor(middleSeries.metadata.length / 2)];
    const middleFrames = getValue(middleInstance, Tags.NumberOfFrames) || 1;
    await writeThumbnailForTarget({
      reader,
      dicomdir,
      outputDicomdir,
      studyUID,
      seriesUID: middleSeries.seriesUid,
      instanceMetadata: middleInstance,
      frameNumber: Math.ceil(middleFrames / 2),
      level: 'study',
      force,
    });
    return;
  }

  if (seriesThumbnail) {
    for (const series of seriesToProcess) {
      const targetSeriesUID = getValue(series, Tags.SeriesInstanceUID);
      if (!targetSeriesUID) continue;
      const metadata = await reader.readJsonFile(reader.getSeriesPath(studyUID, targetSeriesUID), 'metadata');
      if (!Array.isArray(metadata) || !metadata.length) continue;
      const middle = metadata[Math.floor(metadata.length / 2)];
      const middleFrames = getValue(middle, Tags.NumberOfFrames) || 1;
      await writeThumbnailForTarget({
        reader,
        dicomdir,
        outputDicomdir,
        studyUID,
        seriesUID: targetSeriesUID,
        instanceMetadata: middle,
        frameNumber: Math.ceil(middleFrames / 2),
        level: 'series',
        force,
      });
    }
    return;
  }

  const targetSeriesUID = getValue(seriesToProcess[0], Tags.SeriesInstanceUID);
  const seriesMetadata = await reader.readJsonFile(reader.getSeriesPath(studyUID, targetSeriesUID), 'metadata');
  if (!Array.isArray(seriesMetadata) || !seriesMetadata.length) {
    throw new Error(`No series metadata found for series ${targetSeriesUID}`);
  }

  let instanceMetadata = seriesMetadata[0];
  if (instanceUid) {
    instanceMetadata = seriesMetadata.find(instance => getValue(instance, Tags.SOPInstanceUID) === instanceUid);
    if (!instanceMetadata) throw new Error(`Instance ${instanceUid} not found in series metadata`);
  }
  const targetInstanceUID = getValue(instanceMetadata, Tags.SOPInstanceUID);
  console.verbose('[thumbnail] instance thumbnail target', {
    studyUID,
    seriesUID: targetSeriesUID,
    sopInstanceUID: targetInstanceUID,
    hint: instanceUid ? 'from --sop-uid' : 'first entry in series metadata (use --sop-uid for another instance)',
  });

  const metaTsRoute = getMetadataTransferSyntaxForRouting(instanceMetadata);
  const isVidInst = Boolean(metaTsRoute && isVideoTransferSyntaxUid(metaTsRoute));
  /** One ffmpeg thumbnail per video instance; multi-frame frame lists apply to regular pixel data only */
  const frameNumsToRun =
    isVidInst && framesToProcess.length > 1 ? [framesToProcess[0]] : framesToProcess;

  for (const frameNum of frameNumsToRun) {
    const thumbnailFilename = framesToProcess.length > 1 ? `thumbnail-${frameNum}` : 'thumbnail';
    await writeThumbnailForTarget({
      reader,
      dicomdir,
      outputDicomdir,
      studyUID,
      seriesUID: targetSeriesUID,
      instanceMetadata,
      frameNumber: frameNum,
      level: 'instance',
      force,
      thumbnailFilename,
    });
  }
}

/**
 * Main function for creating thumbnails
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 * @param {string} [options.seriesUid] - Specific Series Instance UID to process (if not provided, uses first series from study query)
 * @param {string} [options.instanceUid] - Specific SOP Instance UID to process (if not provided, uses first instance from series)
 * @param {number|number[]} [options.frameNumber] - Frame number to use for thumbnail (default: 1) - deprecated, use frameNumbers instead
 * @param {number[]} [options.frameNumbers] - Array of frame numbers to generate thumbnails for (default: [1])
 * @param {boolean} [options.seriesThumbnail] - Generate thumbnails for series (middle SOP instance, middle frame for multiframe)
 * @param {boolean} [options.allThumbnails] - Generate thumbnails for all SOP instances, all series, and study level
 * @param {boolean} [options.force] - Regenerate even when output thumbnail already exists
 */
export async function thumbnailMain(studySelector, options = {}) {
  const { dicomdir, outputDicomdir } = options;
  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }
  const reader = DicomWebStream.createReader(dicomdir);
  if (!reader) {
    throw new Error(`dicomdir is not a valid file/http location: ${dicomdir}`);
  }
  if (/^https?:\/\//i.test(dicomdir) && !outputDicomdir) {
    throw new Error('--output-dicomdir is required when dicomdir is http/https');
  }
  if ((outputDicomdir || dicomdir).startsWith('http')) {
    throw new Error('Thumbnail output must be a file path, not an http(s) endpoint');
  }

  console.verbose('[thumbnail] thumbnailMain', {
    studySelector: studySelector || 'true',
    dicomdir,
    outputDicomdir: outputDicomdir ?? '(same as dicomdir)',
    reader: reader.constructor?.name ?? typeof reader,
  });

  const studyUIDs = await resolveStudyUIDs(reader, studySelector || 'true');
  console.verbose('[thumbnail] resolved studies', studyUIDs.length, studyUIDs);
  if (!studyUIDs.length) {
    throw new Error(`No studies matched selector: ${studySelector || 'true'}`);
  }
  for (const studyUID of studyUIDs) {
    await generateForStudy(studyUID, { ...options, reader, dicomdir, outputDicomdir });
  }
  console.noQuiet(`Thumbnail generation completed for ${studyUIDs.length} study(ies)`);
}
