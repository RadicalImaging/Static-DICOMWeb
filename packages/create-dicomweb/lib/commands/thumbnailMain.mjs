import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { FileDicomWebReader } from '../instance/FileDicomWebReader.mjs';
import { FileDicomWebWriter } from '../instance/FileDicomWebWriter.mjs';
import { Tags } from '@radicalimaging/static-wado-util';
import { readBulkData } from '@radicalimaging/static-wado-util';

const requireFromMeta = createRequire(import.meta.url);
const StaticWado = requireFromMeta('@radicalimaging/static-wado-creator/lib/StaticWado.js');

const { getValue } = Tags;

/**
 * Generates thumbnails for series (middle SOP instance, middle frame for multiframe)
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} options.dicomdir - Base directory path where DICOMweb structure is located
 * @param {string} [options.seriesUid] - Specific Series Instance UID to process (if not provided, processes all series)
 * @param {Object} options.reader - FileDicomWebReader instance
 */
async function generateSeriesThumbnails(studyUID, options = {}) {
  const { dicomdir, seriesUid, reader } = options;

  // Step 1: Get list of series to process
  const seriesIndex = await reader.readJsonFile(
    reader.getStudyPath(studyUID, { path: 'series' }),
    'index.json'
  );

  if (!seriesIndex || !Array.isArray(seriesIndex) || seriesIndex.length === 0) {
    throw new Error(`No series found for study ${studyUID}`);
  }

  // Filter to specific series if provided, otherwise process all
  let seriesToProcess = seriesIndex;
  if (seriesUid) {
    seriesToProcess = seriesIndex.filter(
      series => getValue(series, Tags.SeriesInstanceUID) === seriesUid
    );
    if (seriesToProcess.length === 0) {
      throw new Error(`Series ${seriesUid} not found in study ${studyUID}`);
    }
  }

  console.log(`Generating series thumbnails for ${seriesToProcess.length} series...`);

  // Step 2: Process each series
  const seriesPromises = seriesToProcess.map(async series => {
    const targetSeriesUID = getValue(series, Tags.SeriesInstanceUID);
    if (!targetSeriesUID) {
      console.warn('Could not extract SeriesInstanceUID from series query, skipping');
      return;
    }

    console.log(`Processing series ${targetSeriesUID}...`);

    // Step 3: Read series metadata to get all instances
    const seriesMetadata = await reader.readJsonFile(
      reader.getSeriesPath(studyUID, targetSeriesUID),
      'metadata'
    );

    if (!seriesMetadata || !Array.isArray(seriesMetadata) || seriesMetadata.length === 0) {
      console.warn(`No series metadata found for series ${targetSeriesUID}, skipping`);
      return;
    }

    // Step 4: Choose middle SOP instance
    const middleInstanceIndex = Math.floor(seriesMetadata.length / 2);
    const targetInstanceMetadata = seriesMetadata[middleInstanceIndex];
    const targetInstanceUID = getValue(targetInstanceMetadata, Tags.SOPInstanceUID);

    if (!targetInstanceUID) {
      console.warn(
        `Could not extract SOPInstanceUID from instance metadata for series ${targetSeriesUID}, skipping`
      );
      return;
    }

    console.log(
      `Using middle instance ${targetInstanceUID} (${middleInstanceIndex + 1} of ${seriesMetadata.length}) for series ${targetSeriesUID}`
    );

    // Step 5: Determine middle frame for multiframe
    const numberOfFrames = getValue(targetInstanceMetadata, Tags.NumberOfFrames) || 1;
    const middleFrame = Math.ceil(numberOfFrames / 2);

    console.log(
      `Using middle frame ${middleFrame} of ${numberOfFrames} for instance ${targetInstanceUID}`
    );

    // Step 6: Read pixel data first to get definitive transfer syntax
    try {
      const pixelData = await readPixelData(
        dicomdir,
        studyUID,
        targetSeriesUID,
        targetInstanceMetadata,
        middleFrame
      );

      const frameTransferSyntaxUid = pixelData.transferSyntaxUid;
      if (!frameTransferSyntaxUid) {
        console.warn(
          `Could not determine transfer syntax UID for instance ${targetInstanceUID} from pixel data, skipping`
        );
        return;
      }

      // Step 7: Create writer only after we have definitive transfer syntax
      const writer = new FileDicomWebWriter(
        {
          studyInstanceUid: studyUID,
          seriesInstanceUid: targetSeriesUID,
          sopInstanceUid: targetInstanceUID,
          transferSyntaxUid: frameTransferSyntaxUid,
        },
        { baseDir: dicomdir }
      );

      // Convert ArrayBuffer to Uint8Array if needed
      let imageFrame = pixelData.binaryData;
      if (imageFrame instanceof ArrayBuffer) {
        imageFrame = new Uint8Array(imageFrame);
      }

      // Step 9: Generate thumbnail and write at instance level
      const writeThumbnailCallback = async (buffer, canvasDest) => {
        if (!buffer) {
          console.warn(
            `No thumbnail buffer generated for series ${targetSeriesUID}, instance ${targetInstanceUID}`
          );
          return;
        }

        console.log(`Writing series thumbnail for instance ${targetInstanceUID}...`);

        // Write thumbnail at instance level: ...<seriesUID>/instances/<sopUID>/thumbnail
        const thumbnailStreamInfo = await writer.openSeriesStream('thumbnail', { gzip: false });
        thumbnailStreamInfo.stream.write(Buffer.from(buffer));
        await writer.closeStream(thumbnailStreamInfo.streamKey);

        console.log(`Series thumbnail written successfully for instance ${targetInstanceUID}`);
      };

      // Generate thumbnail using StaticWado's internal method
      await StaticWado.internalGenerateImage(
        imageFrame,
        null, // dataset - not needed when using metadata
        targetInstanceMetadata,
        frameTransferSyntaxUid,
        writeThumbnailCallback
      );

      console.log(`Series thumbnail generation completed for series ${targetSeriesUID}`);
    } catch (error) {
      console.error(
        `Error generating series thumbnail for series ${targetSeriesUID}: ${error.message}`
      );
      throw error;
    }
  });

  // Wait for all series thumbnails to be generated
  try {
    await Promise.all(seriesPromises);
    console.log(`Series thumbnail generation completed for study ${studyUID}`);
  } catch (error) {
    console.error(`Error generating series thumbnails: ${error.message}`);
    throw error;
  }
}

/**
 * Reads pixel data from instance metadata
 * @param {string} baseDir - Base directory for DICOMweb structure
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {Object} instanceMetadata - Instance metadata object
 * @param {number} frameNumber - Frame number (1-based, default: 1)
 * @returns {Promise<Object>} - Object with binaryData, transferSyntaxUid, and contentType
 */
async function readPixelData(baseDir, studyUID, seriesUID, instanceMetadata, frameNumber = 1) {
  const pixelDataTag = Tags.PixelData;
  const pixelData = instanceMetadata[pixelDataTag];

  if (!pixelData) {
    throw new Error('No PixelData found in instance metadata');
  }

  const bulkDataURI = pixelData.BulkDataURI;
  if (!bulkDataURI) {
    throw new Error('No BulkDataURI found in PixelData');
  }

  const studyDir = path.join(baseDir, `studies/${studyUID}`);
  const seriesDir = path.join(studyDir, `series/${seriesUID}`);

  // Resolve bulk data path. SeriesSummary writes series-relative paths:
  // - Frames: "instances/<sopUID>/frames" (resolve from seriesDir)
  // - Bulkdata: "../../bulkdata/..." (resolve from seriesDir)
  // Legacy instance-relative "./frames" is resolved from instance dir.
  let bulkData;
  if (bulkDataURI.indexOf('frames') !== -1) {
    const isSeriesRelative = bulkDataURI.startsWith('./instances/');
    if (!isSeriesRelative && !getValue(instanceMetadata, Tags.SOPInstanceUID)) {
      throw new Error(
        'No SOPInstanceUID in instance metadata; cannot resolve instance-relative frames path'
      );
    }
    const frameBaseDir = isSeriesRelative
      ? seriesDir
      : path.join(seriesDir, 'instances', getValue(instanceMetadata, Tags.SOPInstanceUID));
    const frameBaseName = isSeriesRelative ? bulkDataURI : './frames';
    bulkData = await readBulkData(frameBaseDir, frameBaseName, frameNumber);
  } else {
    bulkData = await readBulkData(seriesDir, bulkDataURI);
  }

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
 */
export async function thumbnailMain(studyUID, options = {}) {
  const { dicomdir, seriesUid, instanceUid, frameNumber, frameNumbers, seriesThumbnail } = options;

  // Support both frameNumber (single) and frameNumbers (array) for backward compatibility
  const framesToProcess = frameNumbers || (frameNumber ? [frameNumber] : [1]);

  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }

  if (!studyUID) {
    throw new Error('studyUID is required');
  }

  const reader = new FileDicomWebReader(dicomdir);

  // If seriesThumbnail is enabled, process series thumbnails
  if (seriesThumbnail) {
    return await generateSeriesThumbnails(studyUID, { dicomdir, seriesUid, reader });
  }

  let targetSeriesUID = seriesUid;

  // Step 1: If series UID not provided, read study query to find series
  if (!targetSeriesUID) {
    console.log(`Reading study query to find series for study ${studyUID}...`);
    const studyQuery = await reader.readJsonFile(reader.getStudyPath(studyUID), 'index.json');

    if (!studyQuery || !Array.isArray(studyQuery) || studyQuery.length === 0) {
      throw new Error(`No study query found for study ${studyUID}`);
    }

    // Read series index to get available series
    const seriesIndex = await reader.readJsonFile(
      reader.getStudyPath(studyUID, { path: 'series' }),
      'index.json'
    );

    if (!seriesIndex || !Array.isArray(seriesIndex) || seriesIndex.length === 0) {
      throw new Error(`No series found for study ${studyUID}`);
    }

    // Use the first series
    const firstSeries = seriesIndex[0];
    targetSeriesUID = getValue(firstSeries, Tags.SeriesInstanceUID);

    if (!targetSeriesUID) {
      throw new Error('Could not extract SeriesInstanceUID from series query');
    }

    console.log(`Using first series: ${targetSeriesUID}`);
  }

  // Step 2: Read series metadata
  console.log(`Reading series metadata for series ${targetSeriesUID}...`);
  const seriesMetadata = await reader.readJsonFile(
    reader.getSeriesPath(studyUID, targetSeriesUID),
    'metadata'
  );

  if (!seriesMetadata || !Array.isArray(seriesMetadata) || seriesMetadata.length === 0) {
    throw new Error(`No series metadata found for series ${targetSeriesUID}`);
  }

  // Step 3: Find instance to use
  let targetInstanceMetadata = null;
  let targetInstanceUID = instanceUid;

  if (targetInstanceUID) {
    // Find specific instance
    targetInstanceMetadata = seriesMetadata.find(
      instance => getValue(instance, Tags.SOPInstanceUID) === targetInstanceUID
    );

    if (!targetInstanceMetadata) {
      throw new Error(`Instance ${targetInstanceUID} not found in series metadata`);
    }
  } else {
    // Use first instance
    targetInstanceMetadata = seriesMetadata[0];
    targetInstanceUID = getValue(targetInstanceMetadata, Tags.SOPInstanceUID);

    if (!targetInstanceUID) {
      throw new Error('Could not extract SOPInstanceUID from instance metadata');
    }

    console.log(`Using first instance: ${targetInstanceUID}`);
  }

  // Step 4: Generate thumbnails for each frame; create writer only after first definitive transfer syntax, then new writer when it changes
  console.log(
    `Generating thumbnails for ${framesToProcess.length} frame(s): ${framesToProcess.join(', ')}...`
  );

  let writer = null;
  let lastTransferSyntaxUid = null;

  for (const frameNum of framesToProcess) {
    try {
      console.log(`Processing frame ${frameNum}...`);

      // Read pixel data first to get definitive transfer syntax
      const pixelData = await readPixelData(
        dicomdir,
        studyUID,
        targetSeriesUID,
        targetInstanceMetadata,
        frameNum
      );

      const frameTransferSyntaxUid = pixelData.transferSyntaxUid;
      if (!frameTransferSyntaxUid) {
        throw new Error('Could not determine transfer syntax UID from pixel data');
      }

      // Create writer on first frame or when transfer syntax changes
      if (!writer || lastTransferSyntaxUid !== frameTransferSyntaxUid) {
        writer = new FileDicomWebWriter(
          {
            studyInstanceUid: studyUID,
            seriesInstanceUid: targetSeriesUID,
            sopInstanceUid: targetInstanceUID,
            transferSyntaxUid: frameTransferSyntaxUid,
          },
          { baseDir: dicomdir }
        );
        lastTransferSyntaxUid = frameTransferSyntaxUid;
      }

      // Convert ArrayBuffer to Uint8Array if needed
      let imageFrame = pixelData.binaryData;
      if (imageFrame instanceof ArrayBuffer) {
        imageFrame = new Uint8Array(imageFrame);
      }

      const thumbnailFilename = framesToProcess.length > 1 ? `thumbnail-${frameNum}` : 'thumbnail';

      // Callback to write thumbnail (receives buffer and canvasDest)
      const writeThumbnailCallback = async (buffer, canvasDest) => {
        if (!buffer) {
          console.warn(`No thumbnail buffer generated for frame ${frameNum}`);
          return;
        }

        console.log(`Writing thumbnail for instance ${targetInstanceUID}, frame ${frameNum}...`);

        const thumbnailStreamInfo = await writer.openInstanceStream(thumbnailFilename, {
          gzip: false,
        });
        thumbnailStreamInfo.stream.write(Buffer.from(buffer));
        await writer.closeStream(thumbnailStreamInfo.streamKey);

        console.log(`Thumbnail written successfully for frame ${frameNum} as ${thumbnailFilename}`);
      };

      await StaticWado.internalGenerateImage(
        imageFrame,
        null,
        targetInstanceMetadata,
        frameTransferSyntaxUid,
        writeThumbnailCallback
      );

      console.log(`Thumbnail generation completed for frame ${frameNum}`);
    } catch (error) {
      console.error(`Error generating thumbnail for frame ${frameNum}: ${error.message}`);
      throw error;
    }
  }

  console.log(
    `Thumbnail generation completed for study ${studyUID}, series ${targetSeriesUID}, instance ${targetInstanceUID}`
  );
}
