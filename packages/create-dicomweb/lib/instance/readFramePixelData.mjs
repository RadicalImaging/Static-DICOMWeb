import path from 'path';
import { Tags, readBulkData } from '@radicalimaging/static-wado-util';

const { getValue } = Tags;

/**
 * Reads one frame's pixel data out of a DICOMweb tree.
 *
 * The BulkDataURI in instance metadata is written relative to whichever level the metadata
 * was read from, so the base directory for the read depends on its shape:
 * - `./instances/<sopUID>/frames` - series relative, as SeriesSummary rewrites it
 * - `./frames` - instance relative, the legacy form, resolved from the instance directory
 * - `../../bulkdata/...` - series relative bulkdata
 *
 * @param {string} baseDir - Base directory for the DICOMweb structure
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {Object} instanceMetadata - Instance metadata object
 * @param {number} [frameNumber=1] - Frame number (1-based)
 * @returns {Promise<{binaryData: ArrayBuffer, transferSyntaxUid: string, contentType: string}>}
 */
export async function readFramePixelData(
  baseDir,
  studyUID,
  seriesUID,
  instanceMetadata,
  frameNumber = 1
) {
  const pixelData = instanceMetadata[Tags.PixelData];

  if (!pixelData) {
    throw new Error('No PixelData found in instance metadata');
  }

  const bulkDataURI = pixelData.BulkDataURI;
  if (!bulkDataURI) {
    throw new Error('No BulkDataURI found in PixelData');
  }

  const seriesDir = path.join(baseDir, `studies/${studyUID}`, `series/${seriesUID}`);

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
      getValue(instanceMetadata, Tags.AvailableTransferSyntaxUID) ||
      getValue(instanceMetadata, Tags.TransferSyntaxUID),
    contentType: bulkData.contentType,
  };
}

/**
 * Reads one frame as a Uint8Array of the bytes as stored (codestream or native pixels).
 * @param {string} baseDir - Base directory for the DICOMweb structure
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {Object} instanceMetadata - Instance metadata object
 * @param {number} [frameNumber=1] - Frame number (1-based)
 * @returns {Promise<{bytes: Uint8Array, transferSyntaxUid: string}>}
 */
export async function readFrameBytes(
  baseDir,
  studyUID,
  seriesUID,
  instanceMetadata,
  frameNumber = 1
) {
  const { binaryData, transferSyntaxUid } = await readFramePixelData(
    baseDir,
    studyUID,
    seriesUID,
    instanceMetadata,
    frameNumber
  );
  const bytes =
    binaryData instanceof Uint8Array
      ? binaryData
      : new Uint8Array(
          binaryData.buffer ?? binaryData,
          binaryData.byteOffset ?? 0,
          binaryData.byteLength
        );
  return { bytes, transferSyntaxUid };
}
