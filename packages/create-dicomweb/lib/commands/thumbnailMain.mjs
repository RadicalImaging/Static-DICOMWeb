import { DicomWebStream } from '../instance/DicomWebStream.mjs';
import { FileDicomWebWriter } from '../instance/FileDicomWebWriter.mjs';
import { Tags, qidoFilter } from '@radicalimaging/static-wado-util';
import StaticWado from '@radicalimaging/static-wado-creator';

const { getValue } = Tags;

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
 * Reads pixel data from instance metadata
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {Object} instanceMetadata - Instance metadata object
 * @param {number} frameNumber - Frame number (1-based, default: 1)
 * @returns {Promise<Object>} - Object with binaryData, transferSyntaxUid, and contentType
 */
async function readPixelData(reader, studyUID, seriesUID, instanceMetadata, frameNumber = 1) {
  const pixelDataTag = Tags.PixelData;
  const pixelData = instanceMetadata[pixelDataTag];

  if (!pixelData) {
    throw new Error('No PixelData found in instance metadata');
  }

  const bulkDataURI = pixelData.BulkDataURI;
  if (!bulkDataURI) {
    throw new Error('No BulkDataURI found in PixelData');
  }

  const bulkData = await reader.readBulkData(
    studyUID,
    seriesUID,
    bulkDataURI,
    frameNumber,
    getValue(instanceMetadata, Tags.SOPInstanceUID)
  );

  if (!bulkData) {
    throw new Error(`Failed to read bulk data for frame ${frameNumber}`);
  }

  return {
    binaryData: bulkData.binaryData,
    transferSyntaxUid:
      bulkData.transferSyntaxUid ||
      pixelData.transferSyntaxUid ||
      getValue(instanceMetadata, Tags.TransferSyntaxUID),
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
}) {
  const instanceUID = getValue(instanceMetadata, Tags.SOPInstanceUID);
  if (!instanceUID) {
    throw new Error('Could not extract SOPInstanceUID from instance metadata');
  }

  const pixelData = await readPixelData(reader, studyUID, seriesUID, instanceMetadata, frameNumber);
  const transferSyntaxUid = pixelData.transferSyntaxUid;
  if (!transferSyntaxUid) {
    throw new Error(`Could not determine transfer syntax UID for instance ${instanceUID}`);
  }

  const writer = new FileDicomWebWriter(
    {
      studyInstanceUid: studyUID,
      seriesInstanceUid: seriesUID,
      sopInstanceUid: instanceUID,
      transferSyntaxUid,
    },
    { baseDir: outputDicomdir || dicomdir }
  );

  let imageFrame = pixelData.binaryData;
  if (imageFrame instanceof ArrayBuffer) {
    imageFrame = new Uint8Array(imageFrame);
  }

  const writeThumbnailCallback = async buffer => {
    if (!buffer) {
      console.warn(
        `No thumbnail buffer generated for ${level} thumbnail (${studyUID}/${seriesUID}/${instanceUID})`
      );
      return;
    }

    let thumbnailStreamInfo;
    if (level === 'study') {
      thumbnailStreamInfo = await writer.openStudyStream('thumbnail', { gzip: false });
    } else if (level === 'series') {
      thumbnailStreamInfo = await writer.openSeriesStream('thumbnail', { gzip: false });
    } else {
      thumbnailStreamInfo = await writer.openInstanceStream('thumbnail', { gzip: false });
    }

    thumbnailStreamInfo.stream.write(Buffer.from(buffer));
    await writer.closeStream(thumbnailStreamInfo.streamKey);
  };

  await StaticWado.internalGenerateImage(
    imageFrame,
    null,
    instanceMetadata,
    transferSyntaxUid,
    writeThumbnailCallback
  );
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
  const { reader, dicomdir, outputDicomdir, seriesUid, instanceUid, frameNumbers, frameNumber, allThumbnails, seriesThumbnail } =
    options;
  const framesToProcess = frameNumbers || (frameNumber ? [frameNumber] : [1]);

  const seriesIndex = await reader.readJsonFile(
    reader.getStudyPath(studyUID, { path: 'series' }),
    'index.json'
  );
  if (!seriesIndex || !Array.isArray(seriesIndex) || seriesIndex.length === 0) {
    throw new Error(`No series found for study ${studyUID}`);
  }

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
  let writer = null;
  let lastTransferSyntaxUid = null;
  for (const frameNum of framesToProcess) {
    const pixelData = await readPixelData(reader, studyUID, targetSeriesUID, instanceMetadata, frameNum);
    const frameTransferSyntaxUid = pixelData.transferSyntaxUid;
    if (!frameTransferSyntaxUid) throw new Error('Could not determine transfer syntax UID from pixel data');
    if (!writer || lastTransferSyntaxUid !== frameTransferSyntaxUid) {
      writer = new FileDicomWebWriter(
        {
          studyInstanceUid: studyUID,
          seriesInstanceUid: targetSeriesUID,
          sopInstanceUid: targetInstanceUID,
          transferSyntaxUid: frameTransferSyntaxUid,
        },
        { baseDir: outputDicomdir || dicomdir }
      );
      lastTransferSyntaxUid = frameTransferSyntaxUid;
    }
    let imageFrame = pixelData.binaryData;
    if (imageFrame instanceof ArrayBuffer) imageFrame = new Uint8Array(imageFrame);
    const thumbnailFilename = framesToProcess.length > 1 ? `thumbnail-${frameNum}` : 'thumbnail';
    await StaticWado.internalGenerateImage(imageFrame, null, instanceMetadata, frameTransferSyntaxUid, async buffer => {
      if (!buffer) return;
      const thumbnailStreamInfo = await writer.openInstanceStream(thumbnailFilename, { gzip: false });
      thumbnailStreamInfo.stream.write(Buffer.from(buffer));
      await writer.closeStream(thumbnailStreamInfo.streamKey);
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
  const studyUIDs = await resolveStudyUIDs(reader, studySelector || 'true');
  if (!studyUIDs.length) {
    throw new Error(`No studies matched selector: ${studySelector || 'true'}`);
  }
  for (const studyUID of studyUIDs) {
    await generateForStudy(studyUID, { ...options, reader, dicomdir, outputDicomdir });
  }
  console.log(`Thumbnail generation completed for ${studyUIDs.length} study(ies)`);
}
