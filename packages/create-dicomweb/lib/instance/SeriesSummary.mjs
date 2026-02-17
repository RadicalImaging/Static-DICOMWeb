import fs from 'fs';
import path from 'path';
import { FileDicomWebReader } from './FileDicomWebReader.mjs';
import { writeWithRetry } from './writeWithRetry.mjs';
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
 * Reads all instance metadata and derives series query data for a series.
 * @param {FileDicomWebReader} reader
 * @param {string} studyUID
 * @param {string} seriesUID
 * @param {Set<string>} actualInstanceUIDs
 * @returns {Promise<{instanceMetadataArray: Object[], seriesQuery: Object|null, instancesQuery: Object[]}>}
 */
async function readSeriesData(reader, studyUID, seriesUID, actualInstanceUIDs) {
  const instanceMetadataArray = [];

  for (const instanceUID of actualInstanceUIDs) {
    const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUID);
    try {
      let instanceMetadata = await reader.readJsonFile(instancePath, 'metadata');
      if (instanceMetadata) {
        if (Array.isArray(instanceMetadata) && instanceMetadata.length > 0) {
          instanceMetadata = instanceMetadata[0];
        }
        instanceMetadata = updateLocation(instanceMetadata, instanceUID);
        instanceMetadataArray.push(instanceMetadata);
      }
    } catch (error) {
      console.warn(`Failed to read metadata for instance ${instanceUID}: ${error.message}`);
    }
  }

  // Sort by InstanceNumber
  instanceMetadataArray.sort((a, b) => {
    const instanceNumberA = getValue(a, Tags.InstanceNumber);
    const instanceNumberB = getValue(b, Tags.InstanceNumber);
    const numA = instanceNumberA !== undefined ? Number(instanceNumberA) : Number.MAX_SAFE_INTEGER;
    const numB = instanceNumberB !== undefined ? Number(instanceNumberB) : Number.MAX_SAFE_INTEGER;
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    const strA = String(instanceNumberA || '');
    const strB = String(instanceNumberB || '');
    return strA.localeCompare(strB);
  });

  // Extract series query and instances query
  let seriesQuery = null;
  const instancesQuery = [];

  if (instanceMetadataArray.length > 0) {
    const firstInstance = instanceMetadataArray[0];
    seriesQuery = TagLists.extract(firstInstance, 'series', TagLists.SeriesQuery);
    setValue(seriesQuery, Tags.NumberOfSeriesRelatedInstances, instanceMetadataArray.length);

    for (const instanceMetadata of instanceMetadataArray) {
      const instanceQuery = TagLists.extract(instanceMetadata, 'instance', TagLists.InstanceQuery);
      instancesQuery.push(instanceQuery);
    }
  }

  return { instanceMetadataArray, seriesQuery, instancesQuery };
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

  // Step 1: Check if series metadata exists
  let existingInstanceUIDs = new Set();
  try {
    const existingMetadata = await reader.readJsonFile(seriesPath, 'metadata');
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
    existingInstanceUIDs = new Set();
  }

  // Step 2: Scan the instances directory to get actual instance UIDs
  const instanceDirectories = await reader.scanDirectory(instancesPath, { withFileTypes: true });
  const actualInstanceUIDs = new Set();

  for (const entry of instanceDirectories) {
    if (entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory()) {
      actualInstanceUIDs.add(entry.name);
    } else if (typeof entry === 'string') {
      const instanceDirPath = `${instancesPath}/${entry}`;
      const fullInstancePath = path.join(reader.baseDir, instanceDirPath);
      try {
        const stats = fs.lstatSync(fullInstancePath);
        if (stats.isDirectory()) {
          actualInstanceUIDs.add(entry);
        }
      } catch (error) {
        console.warn(`Could not stat ${instanceDirPath}: ${error.message}`);
      }
    }
  }

  // Step 3: Compare sets - if they match exactly, return early
  if (existingInstanceUIDs.size === actualInstanceUIDs.size &&
      [...existingInstanceUIDs].every(uid => actualInstanceUIDs.has(uid))) {
    console.noQuiet('seriesSummary: instance index is up to date');
    // return; // Metadata is up to date
  }

  const informationProvider = { studyInstanceUid: studyUID, seriesInstanceUid: seriesUID };

  // Step 7: Write new series metadata file with retry
  console.noQuiet('seriesSummary: writing new series metadata file');
  await writeWithRetry({
    informationProvider,
    baseDir,
    openStream: (writer) => writer.openSeriesStream('metadata', { gzip: true, compareOnClose: true }),
    generateData: async () => {
      const data = await readSeriesData(reader, studyUID, seriesUID, actualInstanceUIDs);
      return JSON.stringify(data.instanceMetadataArray);
    },
    label: `seriesSummary(${studyUID}/${seriesUID}) metadata`,
  });

  // Step 8: Write series-singleton.json.gz with retry
  await writeWithRetry({
    informationProvider,
    baseDir,
    openStream: (writer) => writer.openSeriesStream('series-singleton.json', { gzip: true, compareOnClose: true }),
    generateData: async () => {
      const data = await readSeriesData(reader, studyUID, seriesUID, actualInstanceUIDs);
      if (!data.seriesQuery) return null;
      return JSON.stringify([data.seriesQuery]);
    },
    label: `seriesSummary(${studyUID}/${seriesUID}) series-singleton.json`,
  });

  // Step 9: Write instances/index.json.gz with retry
  await writeWithRetry({
    informationProvider,
    baseDir,
    openStream: (writer) => writer.openSeriesStream('instances/index.json', { gzip: true, compareOnClose: true }),
    generateData: async () => {
      const data = await readSeriesData(reader, studyUID, seriesUID, actualInstanceUIDs);
      if (data.instancesQuery.length === 0) return null;
      return JSON.stringify(data.instancesQuery);
    },
    label: `seriesSummary(${studyUID}/${seriesUID}) instances/index.json`,
  });
}
