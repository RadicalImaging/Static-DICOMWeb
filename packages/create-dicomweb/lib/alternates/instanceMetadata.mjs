import { Tags } from '@radicalimaging/static-wado-util';
import { writeWithRetry } from '../instance/writeWithRetry.mjs';

const { getValue, setValue } = Tags;

/** Private creator for this repository's private attributes */
export const PRIVATE_CREATOR = 'RadicalImaging';

/**
 * (0009,10E0) UR BrickManifestURI.
 *
 * Group 0009 block 10 is already reserved in this repository - (0009,1001) carries
 * Content-Location - so this extends a block already in use rather than claiming a new
 * private group. Levels, brick size and transfer syntax stay in the manifest, not in DICOM,
 * so the layout can change without a tag change.
 */
export const BRICK_MANIFEST_URI = { creator: PRIVATE_CREATOR, tag: '000910E0', vr: 'UR' };

/**
 * Sets the brick manifest URI on an instance's metadata, reserving the private block if needed.
 * @param {Object} instanceMetadata - Instance metadata, mutated in place
 * @param {string} uri - Manifest URI, study relative
 * @returns {boolean} - True when the metadata changed
 */
export function setBrickManifestUri(instanceMetadata, uri) {
  if (getValue(instanceMetadata, BRICK_MANIFEST_URI) === uri) {
    return false;
  }
  setValue(instanceMetadata, BRICK_MANIFEST_URI, uri);
  // Tags.findPrivate reserves the block with a CS private creator; PS3.5 requires LO.
  const creatorTag = findPrivateCreatorTag(instanceMetadata, PRIVATE_CREATOR);
  if (creatorTag) {
    instanceMetadata[creatorTag].vr = 'LO';
  }
  return true;
}

/**
 * Updates the transfer syntax an instance's frames are stored in.
 *
 * AvailableTransferSyntaxUID (0008,3002) is what this tree records for frame encoding, and it
 * is what the readers consult; the file meta TransferSyntaxUID (0002,0010) is updated too when
 * it happens to be present, so the two never disagree.
 *
 * @param {Object} instanceMetadata - Instance metadata, mutated in place
 * @param {string} transferSyntaxUid - New transfer syntax
 * @returns {boolean} - True when the metadata changed
 */
export function setFrameTransferSyntax(instanceMetadata, transferSyntaxUid) {
  let changed = false;
  if (getValue(instanceMetadata, Tags.AvailableTransferSyntaxUID) !== transferSyntaxUid) {
    setValue(instanceMetadata, Tags.AvailableTransferSyntaxUID, transferSyntaxUid);
    changed = true;
  }
  if (
    instanceMetadata[Tags.TransferSyntaxUID] !== undefined &&
    getValue(instanceMetadata, Tags.TransferSyntaxUID) !== transferSyntaxUid
  ) {
    setValue(instanceMetadata, Tags.TransferSyntaxUID, transferSyntaxUid);
    changed = true;
  }
  return changed;
}

/**
 * Reads an instance's own metadata file, unwrapping the single element array form.
 * @param {Object} reader - FileDicomWebReader
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {string} instanceUid - SOP Instance UID
 * @returns {Promise<Object|undefined>}
 */
export async function readInstanceMetadata(reader, studyUID, seriesUID, instanceUid) {
  const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUid);
  const metadata = await reader.readJsonFile(instancePath, 'metadata');
  if (!metadata) {
    return undefined;
  }
  return Array.isArray(metadata) ? metadata[0] : metadata;
}

/**
 * Writes an instance's metadata file back.
 *
 * The instance file is the source of truth - seriesSummary rebuilds the series level
 * metadata, series-singleton and instance index from it - so callers should run
 * seriesSummary once after updating a series' instances.
 *
 * @param {Object} params - Write parameters
 * @param {string} params.baseDir - Base directory for the DICOMweb structure
 * @param {string} params.studyUID - Study Instance UID
 * @param {string} params.seriesUID - Series Instance UID
 * @param {string} params.instanceUid - SOP Instance UID
 * @param {Object} params.metadata - Instance metadata to write
 * @returns {Promise<{writeStatus: string, path: string|undefined}>}
 */
export async function writeInstanceMetadata({
  baseDir,
  studyUID,
  seriesUID,
  instanceUid,
  metadata,
}) {
  return writeWithRetry({
    informationProvider: {
      studyInstanceUid: studyUID,
      seriesInstanceUid: seriesUID,
      sopInstanceUid: instanceUid,
    },
    baseDir,
    openStream: writer =>
      writer.openInstanceStream('metadata', { gzip: true, compareOnClose: true }),
    generateData: async () => JSON.stringify(metadata),
    label: `instance metadata ${instanceUid}`,
  });
}

/**
 * Finds the private creator element that reserves a block for a creator.
 * @param {Object} item - DICOM JSON item
 * @param {string} creator - Private creator string
 * @returns {string|undefined} - The creator element's tag
 */
function findPrivateCreatorTag(item, creator) {
  for (const [tag, value] of Object.entries(item)) {
    if (/^\d{4}00[1-9a-fA-F][0-9a-fA-F]$/.test(tag) && value?.Value?.[0] === creator) {
      return tag;
    }
  }
  return undefined;
}
