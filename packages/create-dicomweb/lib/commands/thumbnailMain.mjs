import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { FileDicomWebReader } from '../instance/FileDicomWebReader.mjs';
import { FileDicomWebWriter } from '../instance/FileDicomWebWriter.mjs';
import { Tags } from '@radicalimaging/static-wado-util';
import { readBulkData } from '@radicalimaging/static-wado-util';

const require = createRequire(import.meta.url);
const StaticWado = require('@radicalimaging/static-wado-creator/lib/StaticWado.js');

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
  const seriesIndex = await reader.readJsonFile(reader.getStudyPath(studyUID, { path: 'series' }), 'index.json');
  
  if (!seriesIndex || !Array.isArray(seriesIndex) || seriesIndex.length === 0) {
    throw new Error(`No series found for study ${studyUID}`);
  }

  // Filter to specific series if provided, otherwise process all
  let seriesToProcess = seriesIndex;
  if (seriesUid) {
    seriesToProcess = seriesIndex.filter(series => getValue(series, Tags.SeriesInstanceUID) === seriesUid);
    if (seriesToProcess.length === 0) {
      throw new Error(`Series ${seriesUid} not found in study ${studyUID}`);
    }
  }

  console.log(`Generating series thumbnails for ${seriesToProcess.length} series...`);

  // Step 2: Process each series
  const seriesPromises = seriesToProcess.map(async (series) => {
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
      console.warn(`Could not extract SOPInstanceUID from instance metadata for series ${targetSeriesUID}, skipping`);
      return;
    }

    console.log(`Using middle instance ${targetInstanceUID} (${middleInstanceIndex + 1} of ${seriesMetadata.length}) for series ${targetSeriesUID}`);

    // Step 5: Determine middle frame for multiframe
    const numberOfFrames = getValue(targetInstanceMetadata, Tags.NumberOfFrames) || 1;
    const middleFrame = Math.ceil(numberOfFrames / 2);

    console.log(`Using middle frame ${middleFrame} of ${numberOfFrames} for instance ${targetInstanceUID}`);

    // Step 6: Get transfer syntax UID
    const transferSyntaxUid = 
      getValue(targetInstanceMetadata, Tags.TransferSyntaxUID) ||
      getValue(targetInstanceMetadata, Tags.AvailableTransferSyntaxUID);

    if (!transferSyntaxUid) {
      console.warn(`Could not determine transfer syntax UID for instance ${targetInstanceUID}, skipping`);
      return;
    }

    // Step 7: Create writer for thumbnail
    const writer = new FileDicomWebWriter(
      {
        studyInstanceUid: studyUID,
        seriesInstanceUid: targetSeriesUID,
        sopInstanceUid: targetInstanceUID,
        transferSyntaxUid: transferSyntaxUid,
      },
      { baseDir: dicomdir }
    );

    // Step 8: Read pixel data for middle frame
    try {
      const pixelData = await readPixelData(
        dicomdir,
        studyUID,
        targetSeriesUID,
        targetInstanceMetadata,
        middleFrame
      );

      // Use transfer syntax from pixel data if available, otherwise use from metadata
      const frameTransferSyntaxUid = pixelData.transferSyntaxUid || transferSyntaxUid;

      // Convert ArrayBuffer to Uint8Array if needed
      let imageFrame = pixelData.binaryData;
      if (imageFrame instanceof ArrayBuffer) {
        imageFrame = new Uint8Array(imageFrame);
      }

      // Step 9: Generate thumbnail and write at instance level
      const writeThumbnailCallback = async (buffer, canvasDest) => {
        if (!buffer) {
          console.warn(`No thumbnail buffer generated for series ${targetSeriesUID}, instance ${targetInstanceUID}`);
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
      console.error(`Error generating series thumbnail for series ${targetSeriesUID}: ${error.message}`);
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

  // Read the bulk data (frame data)
  // If BulkDataURI contains '/frames', it's frame data and should be read from series directory
  // Otherwise, it's bulk data and should be read from study directory
  // This matches the logic in createThumbnail.js
  let bulkData;
  if (bulkDataURI.indexOf('/frames') !== -1) {
    // Frame data - read from series directory
    bulkData = await readBulkData(seriesDir, bulkDataURI, frameNumber);
  } else {
    // Other bulk data - read from study directory
    bulkData = await readBulkData(studyDir, bulkDataURI);
  }
  
  if (!bulkData) {
    throw new Error(`Failed to read bulk data for frame ${frameNumber}`);
  }

  return {
    binaryData: bulkData.binaryData,
    transferSyntaxUid: bulkData.transferSyntaxUid || pixelData.transferSyntaxUid || getValue(instanceMetadata, Tags.TransferSyntaxUID),
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
    const seriesIndex = await reader.readJsonFile(reader.getStudyPath(studyUID, { path: 'series' }), 'index.json');
    
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

  // Step 4: Get transfer syntax UID (needed before reading pixel data)
  const transferSyntaxUid = 
    getValue(targetInstanceMetadata, Tags.TransferSyntaxUID) ||
    getValue(targetInstanceMetadata, Tags.AvailableTransferSyntaxUID);

  if (!transferSyntaxUid) {
    throw new Error('Could not determine transfer syntax UID');
  }

  // Step 5: Create writer for thumbnails (reused for all frames)
  const writer = new FileDicomWebWriter(
    {
      studyInstanceUid: studyUID,
      seriesInstanceUid: targetSeriesUID,
      sopInstanceUid: targetInstanceUID,
      transferSyntaxUid: transferSyntaxUid,
    },
    { baseDir: dicomdir }
  );

  // Step 6: Generate thumbnails for each frame
  console.log(`Generating thumbnails for ${framesToProcess.length} frame(s): ${framesToProcess.join(', ')}...`);
  
  const thumbnailPromises = framesToProcess.map(async (frameNum) => {
    try {
      console.log(`Processing frame ${frameNum}...`);
      
      // Read pixel data for this frame
      const pixelData = await readPixelData(
        dicomdir,
        studyUID,
        targetSeriesUID,
        targetInstanceMetadata,
        frameNum
      );

      // Use transfer syntax from pixel data if available, otherwise use from metadata
      const frameTransferSyntaxUid = pixelData.transferSyntaxUid || transferSyntaxUid;

      // Convert ArrayBuffer to Uint8Array if needed
      let imageFrame = pixelData.binaryData;
      if (imageFrame instanceof ArrayBuffer) {
        imageFrame = new Uint8Array(imageFrame);
      }

      // Callback to write thumbnail (receives buffer and canvasDest)
      const writeThumbnailCallback = async (buffer, canvasDest) => {
        if (!buffer) {
          console.warn(`No thumbnail buffer generated for frame ${frameNum}`);
          return;
        }

        console.log(`Writing thumbnail for instance ${targetInstanceUID}, frame ${frameNum}...`);
        
        // Write thumbnail at instance level
        // If multiple frames are requested, save each with frame number in filename
        // If only one frame, save as 'thumbnail' for backward compatibility
        const thumbnailFilename = framesToProcess.length > 1 
          ? `thumbnail-${frameNum}` 
          : 'thumbnail';
        
        const thumbnailStreamInfo = await writer.openInstanceStream(thumbnailFilename, { gzip: false });
        thumbnailStreamInfo.stream.write(Buffer.from(buffer));
        await writer.closeStream(thumbnailStreamInfo.streamKey);
        
        console.log(`Thumbnail written successfully for frame ${frameNum} as ${thumbnailFilename}`);
      };

      // Generate thumbnail using StaticWado's internal method
      await StaticWado.internalGenerateImage(
        imageFrame,
        null, // dataset - not needed when using metadata
        targetInstanceMetadata,
        frameTransferSyntaxUid,
        writeThumbnailCallback
      );
      
      console.log(`Thumbnail generation completed for frame ${frameNum}`);
    } catch (error) {
      console.error(`Error generating thumbnail for frame ${frameNum}: ${error.message}`);
      throw error;
    }
  });

  // Wait for all thumbnails to be generated
  try {
    await Promise.all(thumbnailPromises);
    console.log(`Thumbnail generation completed for study ${studyUID}, series ${targetSeriesUID}, instance ${targetInstanceUID}`);
  } catch (error) {
    console.error(`Error generating thumbnails: ${error.message}`);
    throw error;
  }
}
