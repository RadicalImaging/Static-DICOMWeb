import fs from 'fs';
import path from 'path';
import { FileDicomWebReader } from './FileDicomWebReader.mjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';
import { Tags, TagLists } from '@radicalimaging/static-wado-util';

const { getValue, setValue } = Tags;

/**
 * Updates BulkDataURI values from instance-relative paths to series-relative paths
 * so that series-level metadata can resolve bulk data and frames when read from
 * the series directory.
 *
 * Instance-relative paths:
 * - "../../../../bulkdata/" (4 levels up from instance) -> "../../bulkdata/" (2 levels up from series)
 * - "./frames" -> "instances/<sopUID>/frames"
 *
 * @param {Object} instanceMetadata - Instance metadata object to update
 * @param {string} instanceUID - The instance (SOP Instance) UID for this metadata
 * @returns {Object} - Updated instance metadata
 */
function updateLocation(instanceMetadata, instanceUID) {
  if (!instanceMetadata || typeof instanceMetadata !== 'object') {
    return instanceMetadata;
  }

  function processObject(obj, instanceUid) {
    if (Array.isArray(obj)) {
      return obj.map((item) => processObject(item, instanceUid));
    }

    if (obj && typeof obj === 'object') {
      const result = {};

      for (const [key, value] of Object.entries(obj)) {
        if (key === 'BulkDataURI' && typeof value === 'string') {
          if (value === './frames' || value.startsWith('./frames')) {
            result[key] = `./instances/${instanceUid}/frames`;
          } else {
            result[key] = value.replace(/^(\.\.\/){4}bulkdata\//, '../../bulkdata/');
          }
        } else {
          result[key] = processObject(value, instanceUid);
        }
      }

      return result;
    }

    return obj;
  }

  return processObject(instanceMetadata, instanceUID);
}

/**
 * Creates or updates series metadata/index.json.gz file
 *
 * @param {string} baseDir - Base directory for DICOMweb structure
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @returns {Promise<void>}
 */
export async function seriesSummary(baseDir, studyUID, seriesUID) {
  if (!baseDir || !studyUID || !seriesUID) {
    throw new Error('baseDir, studyUID, and seriesUID are required');
  }

  const reader = new FileDicomWebReader(baseDir);
  const seriesPath = reader.getSeriesPath(studyUID, seriesUID);
  const instancesPath = `${seriesPath}/instances`;

  // Step 1: Check if series metadata/index.json.gz exists
  let existingMetadata = null;
  let existingInstanceUIDs = new Set();

  try {
    existingMetadata = await reader.readJsonFile(seriesPath, 'metadata');

    // Extract SOP Instance UIDs from existing metadata
    if (existingMetadata && Array.isArray(existingMetadata)) {
      for (const instance of existingMetadata) {
        const sopUID = getValue(instance, Tags.SOPInstanceUID);
        if (sopUID) {
          existingInstanceUIDs.add(sopUID);
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to read existing series metadata: ${error.message}`);
    existingMetadata = null;
    existingInstanceUIDs = new Set();
  }

  // Step 2: Scan the instances directory to get actual instance UIDs
  const instanceDirectories = await reader.scanDirectory(instancesPath, { withFileTypes: true });
  const actualInstanceUIDs = new Set();

  for (const entry of instanceDirectories) {
    // If withFileTypes is used, entry is a Dirent object
    if (entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory()) {
      actualInstanceUIDs.add(entry.name);
    } else if (typeof entry === 'string') {
      // Fallback: if entry is a string, check if it's a directory
      const instanceDirPath = `${instancesPath}/${entry}`;
      const fullInstancePath = path.join(reader.baseDir, instanceDirPath);

      try {
        const stats = fs.lstatSync(fullInstancePath);
        if (stats.isDirectory()) {
          actualInstanceUIDs.add(entry);
        }
      } catch (error) {
        // Skip if we can't stat the path
        console.warn(`Could not stat ${instanceDirPath}: ${error.message}`);
      }
    }
  }

  // Step 3: Compare sets - if they match exactly, return early
  if (existingInstanceUIDs.size === actualInstanceUIDs.size &&
      [...existingInstanceUIDs].every(uid => actualInstanceUIDs.has(uid))) {
    console.verbose('seriesSummary: instance index is up to date');
    // return; // Metadata is up to date
  }

  // Step 4: Read all instance metadata files and collect them
  const instanceMetadataArray = [];

  for (const instanceUID of actualInstanceUIDs) {
    const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUID);

    try {
      let instanceMetadata = await reader.readJsonFile(instancePath, 'metadata');

      if (instanceMetadata) {
        // Instance metadata files are arrays with one element
        if (Array.isArray(instanceMetadata) && instanceMetadata.length > 0) {
          instanceMetadata = instanceMetadata[0];
        }

        // Update BulkDataURI paths from instance-relative to series-relative
        instanceMetadata = updateLocation(instanceMetadata, instanceUID);

        instanceMetadataArray.push(instanceMetadata);
      }
    } catch (error) {
      console.warn(`Failed to read metadata for instance ${instanceUID}: ${error.message}`);
    }
  }

  // Step 5: Sort by InstanceNumber
  instanceMetadataArray.sort((a, b) => {
    const instanceNumberA = getValue(a, Tags.InstanceNumber);
    const instanceNumberB = getValue(b, Tags.InstanceNumber);

    // Convert to numbers if possible, otherwise compare as strings
    const numA = instanceNumberA !== undefined ? Number(instanceNumberA) : Number.MAX_SAFE_INTEGER;
    const numB = instanceNumberB !== undefined ? Number(instanceNumberB) : Number.MAX_SAFE_INTEGER;

    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }

    // Fallback to string comparison
    const strA = String(instanceNumberA || '');
    const strB = String(instanceNumberB || '');
    return strA.localeCompare(strB);
  });

  // Step 6: Extract series query and instances query
  let seriesQuery = null;
  const instancesQuery = [];

  if (instanceMetadataArray.length > 0) {
    // Extract series query from the first instance
    const firstInstance = instanceMetadataArray[0];
    seriesQuery = TagLists.extract(firstInstance, 'series', TagLists.SeriesQuery);
    // console.warn('seriesSummary: seriesQuery:', seriesQuery);

    // Add NumberOfSeriesRelatedInstances to series query
    setValue(seriesQuery, Tags.NumberOfSeriesRelatedInstances, instanceMetadataArray.length);

    // Extract instance query for each instance
    for (const instanceMetadata of instanceMetadataArray) {
      const instanceQuery = TagLists.extract(instanceMetadata, 'instance', TagLists.InstanceQuery);
      instancesQuery.push(instanceQuery);
    }
  }

  // Step 7: Write new series metadata file
  console.verbose('seriesSummary: writing new series metadata file');
  const writer = new FileDicomWebWriter({ studyInstanceUid: studyUID, seriesInstanceUid: seriesUID }, { baseDir });
  const metadataStreamInfo = await writer.openSeriesStream('metadata', { gzip: true });
  metadataStreamInfo.stream.write(Buffer.from(JSON.stringify(instanceMetadataArray)));
  await writer.closeStream(metadataStreamInfo.streamKey);
  console.verbose('seriesSummary: metadata file written:', metadataStreamInfo.filepath);

  // Step 8: Write series-singleton.json.gz
  if (seriesQuery) {
    const seriesSingletonStreamInfo = await writer.openSeriesStream('series-singleton.json', { gzip: true });
    seriesSingletonStreamInfo.stream.write(Buffer.from(JSON.stringify([seriesQuery])));
    await writer.closeStream(seriesSingletonStreamInfo.streamKey);
    console.verbose('seriesSummary: series-singleton.json file written:', seriesSingletonStreamInfo.filepath);
  }

  // Step 9: Write instances/index.json.gz
  if (instancesQuery.length > 0) {
    const instancesIndexStreamInfo = await writer.openSeriesStream('instances/index.json', { gzip: true });
    instancesIndexStreamInfo.stream.write(Buffer.from(JSON.stringify(instancesQuery)));
    await writer.closeStream(instancesIndexStreamInfo.streamKey);
    console.verbose('seriesSummary: instances/index.json file written:', instancesIndexStreamInfo.filepath);
  }
}
