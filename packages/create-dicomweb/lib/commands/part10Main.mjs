import path from 'path';
import { data } from 'dcmjs';
import { FileDicomWebReader } from '../instance/FileDicomWebReader.mjs';
import { FileDicomWebWriter } from '../instance/FileDicomWebWriter.mjs';
import { Tags, readBulkData } from '@radicalimaging/static-wado-util';

const { DicomDict, DicomMetaDictionary } = data;
const { getValue } = Tags;

const UncompressedLEIExplicit = '1.2.840.10008.1.2.1';

/**
 * Creates a fresh FileMetaInformationVersion ArrayBuffer
 * @returns {ArrayBuffer} - FileMetaInformationVersion as ArrayBuffer
 */
function createFileMetaInformationVersion() {
  const arrayBuffer = new ArrayBuffer(2);
  const view = new Uint8Array(arrayBuffer);
  view[0] = 0;
  view[1] = 1;
  return arrayBuffer;
}

// Tag for AvailableTransferSyntaxUID (used as fallback for transfer syntax)
const AvailableTransferSyntaxUIDTag = '00083002';

/**
 * Creates File Meta Information for Part 10 file
 * @param {Object} instanceMetadata - Instance metadata object
 * @param {string} transferSyntaxUID - Transfer syntax UID (from frame header or fallback)
 * @returns {Object} - Denaturalized FMI object
 */
function createFmi(instanceMetadata, transferSyntaxUID) {
  const SOPClassUID = getValue(instanceMetadata, Tags.SOPClassUID);
  const SOPInstanceUID = getValue(instanceMetadata, Tags.SOPInstanceUID);

  const naturalFmi = {
    MediaStorageSOPClassUID: SOPClassUID,
    MediaStorageSOPInstanceUID: SOPInstanceUID,
    TransferSyntaxUID: transferSyntaxUID,
    ImplementationClassUID: '2.25.984723498557234098.001',
    ImplementationVersionName: 'static-dicomweb',
    FileMetaInformationVersion: createFileMetaInformationVersion(),
  };

  return DicomMetaDictionary.denaturalizeDataset(naturalFmi);
}

/**
 * Gets the transfer syntax UID from the first frame's bulk data header.
 * Falls back to AvailableTransferSyntaxUIDs, then to default uncompressed.
 * @param {string} seriesDir - Series directory path
 * @param {Object} instanceMetadata - Instance metadata object
 * @returns {Promise<string>} - Transfer syntax UID
 */
async function getTransferSyntaxUID(seriesDir, instanceMetadata) {
  // Best option: Read from first frame's bulk data header
  const pixelDataTag = Tags.PixelData;
  const pixelData = instanceMetadata[pixelDataTag];

  if (pixelData?.BulkDataURI) {
    try {
      const bulkDataURI = pixelData.BulkDataURI;
      const bulk = await readBulkData(seriesDir, bulkDataURI, 1);
      if (bulk?.transferSyntaxUid) {
        return bulk.transferSyntaxUid;
      }
    } catch (e) {
      // Fall through to other options
    }
  }

  // Second choice: AvailableTransferSyntaxUIDs
  const availableTS = instanceMetadata[AvailableTransferSyntaxUIDTag];
  if (availableTS?.Value?.[0]) {
    return availableTS.Value[0];
  }

  // Last resort: default to uncompressed
  console.warn(
    'Could not determine transfer syntax from frame header or AvailableTransferSyntaxUIDs, using default uncompressed'
  );
  return UncompressedLEIExplicit;
}

/**
 * Converts data to a proper ArrayBuffer that dcmjs can handle.
 * ALWAYS creates a fresh copy to avoid shared buffer issues.
 * @param {Buffer|ArrayBuffer|Uint8Array} inputData - Input data
 * @returns {ArrayBuffer} - Proper ArrayBuffer
 */
function toArrayBuffer(inputData) {
  if (!inputData) return inputData;

  let sourceView;

  // Node.js Buffer
  if (Buffer.isBuffer(inputData)) {
    sourceView = new Uint8Array(inputData);
  }
  // ArrayBuffer - wrap in Uint8Array to copy
  else if (inputData instanceof ArrayBuffer) {
    sourceView = new Uint8Array(inputData);
  }
  // Uint8Array or other TypedArray
  else if (inputData instanceof Uint8Array) {
    sourceView = inputData;
  } else if (ArrayBuffer.isView(inputData)) {
    sourceView = new Uint8Array(inputData.buffer, inputData.byteOffset, inputData.byteLength);
  }
  // Unknown type - try to handle it
  else if (inputData.byteLength !== undefined) {
    try {
      sourceView = new Uint8Array(inputData);
    } catch (e) {
      console.warn('Could not convert to ArrayBuffer:', typeof inputData, inputData);
      return inputData;
    }
  } else {
    console.warn('Unknown data type for toArrayBuffer:', typeof inputData, inputData);
    return inputData;
  }

  // Always create a fresh ArrayBuffer copy
  const arrayBuffer = new ArrayBuffer(sourceView.length);
  const destView = new Uint8Array(arrayBuffer);
  destView.set(sourceView);
  return arrayBuffer;
}

/**
 * Decodes base64 string to ArrayBuffer
 * @param {string} base64 - Base64 encoded string
 * @returns {ArrayBuffer} - Decoded ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Reads bulk data value and populates the instance metadata
 * @param {string} seriesDir - Series directory path
 * @param {Object} instanceMetadata - Instance metadata object
 * @param {Object} value - Value object with BulkDataURI
 */
async function readBulkDataValue(seriesDir, instanceMetadata, value) {
  const { BulkDataURI } = value;
  value.vr = value.vr || 'OB';
  const numberOfFrames = getValue(instanceMetadata, Tags.NumberOfFrames) || 1;

  // Remove the BulkDataURI since we're replacing it with actual data
  delete value.BulkDataURI;

  if (BulkDataURI.indexOf('frames') !== -1) {
    // Handle pixel data frames
    value.Value = [];
    for (let frame = 1; frame <= numberOfFrames; frame++) {
      try {
        const bulk = await readBulkData(seriesDir, BulkDataURI, frame);
        if (!bulk) break;
        // readBulkData returns an object with binaryData property
        const frameData = bulk.binaryData || bulk;
        value.Value.push(toArrayBuffer(frameData));
      } catch (e) {
        console.warn(
          `Could not read bulk data for frame ${frame} from ${BulkDataURI}: ${e.message}`
        );
        break;
      }
    }
  } else {
    // Handle other bulk data
    try {
      const bulk = await readBulkData(seriesDir, BulkDataURI);
      if (bulk) {
        const bulkData = bulk.binaryData || bulk;
        value.Value = [toArrayBuffer(bulkData)];
      }
    } catch (e) {
      console.warn(`Could not read bulk data from ${BulkDataURI}: ${e.message}`);
    }
  }
}

// Binary VRs that need ArrayBuffer values
const BINARY_VRS = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'UN']);

// Numeric string VRs that should have string values (not numbers)
const NUMERIC_STRING_VRS = new Set(['IS', 'DS']);

// Internal tags used by static-dicomweb that should be removed from Part 10 output
const INTERNAL_TAGS_TO_REMOVE = new Set([
  '00083002', // AvailableTransferSyntaxUID - internal static-dicomweb tag
]);

/**
 * Converts a numeric array to ArrayBuffer
 * @param {number[]} arr - Array of numbers (bytes)
 * @returns {ArrayBuffer} - ArrayBuffer
 */
function numericArrayToArrayBuffer(arr) {
  const arrayBuffer = new ArrayBuffer(arr.length);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < arr.length; i++) {
    view[i] = arr[i];
  }
  return arrayBuffer;
}

/**
 * Ensures a value is a proper ArrayBuffer for binary VRs
 * @param {*} value - The value to convert
 * @param {string} tag - The DICOM tag (for error messages)
 * @param {string} vr - The VR (for error messages)
 * @returns {ArrayBuffer|'skip'} - Proper ArrayBuffer, or 'skip' to remove the tag
 * @throws {Error} - If value cannot be converted to ArrayBuffer
 */
function ensureArrayBuffer(value, tag, vr) {
  if (!value) {
    throw new Error(
      `Cannot convert null/undefined value to ArrayBuffer for tag ${tag} with VR ${vr}`
    );
  }

  // Already ArrayBuffer
  if (value instanceof ArrayBuffer) {
    return toArrayBuffer(value); // Make a fresh copy
  }

  // Buffer or TypedArray
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || ArrayBuffer.isView(value)) {
    return toArrayBuffer(value);
  }

  // Numeric array
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
    return numericArrayToArrayBuffer(value);
  }

  // Object with byteLength (might be ArrayBuffer-like)
  if (value && typeof value === 'object' && value.byteLength !== undefined) {
    return toArrayBuffer(value);
  }

  // Empty object {} from JSON.stringify losing ArrayBuffer - skip this tag
  if (value && typeof value === 'object' && Object.keys(value).length === 0) {
    return 'skip';
  }

  // Plain object with numeric keys (might be a serialized array)
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every(k => !isNaN(parseInt(k)))) {
      // Convert object with numeric keys to array
      const arr = [];
      for (let i = 0; i < keys.length; i++) {
        if (value[i] !== undefined) {
          arr.push(value[i]);
        } else {
          break;
        }
      }
      if (arr.length > 0 && typeof arr[0] === 'number') {
        return numericArrayToArrayBuffer(arr);
      }
    }
  }

  throw new Error(
    `Cannot convert value to ArrayBuffer for tag ${tag} with VR ${vr}: ${typeof value}`
  );
}

/**
 * Recursively processes instance metadata to convert binary data
 * @param {string} seriesDir - Series directory path
 * @param {Object} instanceMetadata - Instance metadata object
 */
async function readBinaryData(seriesDir, instanceMetadata) {
  for (const tag of Object.keys(instanceMetadata)) {
    // Remove internal tags that shouldn't be in Part 10 output
    if (INTERNAL_TAGS_TO_REMOVE.has(tag)) {
      delete instanceMetadata[tag];
      continue;
    }

    const v = instanceMetadata[tag];

    if (!v || typeof v !== 'object') continue;

    // Handle BulkDataURI
    if (v.BulkDataURI) {
      await readBulkDataValue(seriesDir, instanceMetadata, v);
      continue;
    }

    // Handle InlineBinary (base64 encoded)
    if (v.InlineBinary) {
      v.Value = [base64ToArrayBuffer(v.InlineBinary)];
      delete v.InlineBinary;
      continue;
    }

    // Handle missing vr
    if (!v.vr) {
      const value0 = v.Value?.[0];
      if (typeof value0 === 'string') {
        v.vr = 'LT';
      } else if (value0 === undefined || value0 === null) {
        delete instanceMetadata[tag];
      } else {
        delete instanceMetadata[tag];
      }
      continue;
    }

    // Handle sequences recursively
    if (v.vr === 'SQ' && v.Value && Array.isArray(v.Value)) {
      for (const item of v.Value) {
        if (item && typeof item === 'object') {
          await readBinaryData(seriesDir, item);
        }
      }
      continue;
    }

    // Handle empty Value arrays - remove the tag
    if (v.Value && Array.isArray(v.Value) && v.Value.length === 0) {
      delete instanceMetadata[tag];
      continue;
    }

    // Handle Value arrays with only null/undefined values - remove the tag
    if (Array.isArray(v.Value) && v.Value.every(val => val === null || val === undefined)) {
      delete instanceMetadata[tag];
      continue;
    }

    // Filter out null/undefined values from Value arrays
    if (v.Value && Array.isArray(v.Value)) {
      v.Value = v.Value.filter(val => val !== null && val !== undefined);
      if (v.Value.length === 0) {
        delete instanceMetadata[tag];
        continue;
      }
    }

    // Handle numeric string VRs (IS, DS) - ensure values are strings, not numbers
    if (NUMERIC_STRING_VRS.has(v.vr) && v.Value && Array.isArray(v.Value)) {
      v.Value = v.Value.map(val => {
        if (typeof val === 'number') {
          // Convert number to string, handling special cases
          if (Number.isInteger(val)) {
            return String(val);
          }
          // For DS (Decimal String), preserve precision but avoid scientific notation
          return val.toString();
        }
        return val;
      });
      continue;
    }

    // Handle binary VRs - ensure values are proper ArrayBuffers
    // Skip if values are strings (like UIDs stored with VR UN)
    if (BINARY_VRS.has(v.vr) && v.Value && Array.isArray(v.Value)) {
      // Check if all values are strings - if so, this is likely a UID or similar, not binary data
      const allStrings = v.Value.every(val => typeof val === 'string');
      if (allStrings) {
        // Change VR to UI (UID) or LO (Long String) depending on content
        if (v.Value[0] && v.Value[0].match(/^[\d.]+$/)) {
          v.vr = 'UI'; // Looks like a UID
        } else {
          v.vr = 'LO'; // Generic long string
        }
        continue;
      }

      let shouldDelete = false;
      const convertedValues = [];

      for (const val of v.Value) {
        // Skip string values
        if (typeof val === 'string') {
          convertedValues.push(val);
          continue;
        }
        const converted = ensureArrayBuffer(val, tag, v.vr);
        if (converted === 'skip') {
          // Empty object - we should skip this entire tag
          shouldDelete = true;
          break;
        }
        convertedValues.push(converted);
      }

      if (shouldDelete) {
        console.log(`Removing tag ${tag} with empty binary data`);
        delete instanceMetadata[tag];
      } else {
        v.Value = convertedValues;
      }
    }
  }
}

/**
 * Writes a Part 10 buffer to a file using the output writer
 * @param {import('../instance/DicomWebWriter.mjs').DicomWebWriter} outputWriter - Writer with baseDir set to output directory (uses writeFile)
 * @param {string} fileName - File name (without extension)
 * @param {Buffer} buffer - Buffer to write
 * @returns {Promise<string>} - Resolves with the written file path
 */
async function writeBuffer(outputWriter, fileName, buffer) {
  const filePath = await outputWriter.writeFile('', `${fileName}.dcm`, buffer);
  console.log(`Written: ${filePath}`);
  return filePath;
}

/**
 * Main function for exporting DICOMweb metadata to Part 10 DICOM files
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} options.dicomdir - Base directory path where DICOMweb structure is located
 * @param {string} [options.seriesUid] - Specific Series Instance UID to export (if not provided, exports all series)
 * @param {string} [options.outputDir] - Output directory for Part 10 files (default: '.')
 * @param {boolean} [options.continueOnError] - Continue processing even if an instance fails (default: false)
 */
export async function part10Main(studyUID, options = {}) {
  const { dicomdir, seriesUid, outputDir = '.', continueOnError = false } = options;

  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }

  if (!studyUID) {
    throw new Error('studyUID is required');
  }

  const reader = new FileDicomWebReader(dicomdir);
  const outputWriter = new FileDicomWebWriter({}, { baseDir: outputDir });

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

  console.log(`Exporting ${seriesToProcess.length} series to Part 10 files...`);

  let totalInstances = 0;

  // Step 2: Process each series
  for (const series of seriesToProcess) {
    const targetSeriesUID = getValue(series, Tags.SeriesInstanceUID);
    if (!targetSeriesUID) {
      console.warn('Could not extract SeriesInstanceUID from series, skipping');
      continue;
    }

    console.log(`Processing series ${targetSeriesUID}...`);

    // Step 3: Read series metadata to get all instances
    const seriesMetadata = await reader.readJsonFile(
      reader.getSeriesPath(studyUID, targetSeriesUID),
      'metadata'
    );

    if (!seriesMetadata || !Array.isArray(seriesMetadata) || seriesMetadata.length === 0) {
      console.warn(`No series metadata found for series ${targetSeriesUID}, skipping`);
      continue;
    }

    // Series directory for reading bulk data
    const seriesDir = path.join(dicomdir, `studies/${studyUID}/series/${targetSeriesUID}`);

    // Step 4: Process each instance in the series
    for (const instanceMetadata of seriesMetadata) {
      const sopInstanceUID = getValue(instanceMetadata, Tags.SOPInstanceUID);
      if (!sopInstanceUID) {
        console.warn('Could not extract SOPInstanceUID from instance metadata, skipping');
        continue;
      }

      console.log(`Processing instance ${sopInstanceUID}...`);

      try {
        // Create a deep copy of instance metadata to avoid mutating the original
        const instanceCopy = JSON.parse(JSON.stringify(instanceMetadata));

        // Step 5: Get transfer syntax from first frame header (before readBinaryData modifies things)
        const transferSyntaxUID = await getTransferSyntaxUID(seriesDir, instanceCopy);

        // Step 6: Populate bulk data (pixel data, etc.)
        await readBinaryData(seriesDir, instanceCopy);

        // Step 7: Create FMI with the transfer syntax from frame header
        const fmi = createFmi(instanceCopy, transferSyntaxUID);

        // Step 8: Create DicomDict and write Part 10 file
        const dicomDict = new DicomDict(fmi);
        dicomDict.dict = instanceCopy;

        const buffer = Buffer.from(dicomDict.write());
        await writeBuffer(outputWriter, sopInstanceUID, buffer);

        totalInstances++;
      } catch (error) {
        console.error(`Error processing instance ${sopInstanceUID}: ${error.message}`);
        if (!continueOnError) {
          throw error;
        }
        console.warn(
          `Skipping instance ${sopInstanceUID} due to error (--continue-on-error enabled)`
        );
      }
    }
  }

  console.log(`Part 10 export completed: ${totalInstances} instance(s) written to ${outputDir}`);
}
