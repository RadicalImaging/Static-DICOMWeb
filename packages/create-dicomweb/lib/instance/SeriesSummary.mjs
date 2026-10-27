import { FileDicomWebReader, createBuildReader } from './FileDicomWebReader.mjs';
import { writeMultipleWithRetry } from './writeWithRetry.mjs';
import { generationTracker, seriesGenerationKey } from './generationTracker.mjs';
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
      return obj.map(item => processObject(item, instanceUid));
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
 * An instance whose own metadata is missing or corrupt keeps its entry from the
 * current series metadata. An instance with neither is left out (`droppedCount`).
 * The reader must use `throwOnIoError`: an I/O error then throws, so the build fails and
 * stores nothing (SQR-D3).
 * @param {FileDicomWebReader} reader
 * @param {string} studyUID
 * @param {string} seriesUID
 * @param {Set<string>} actualInstanceUIDs
 * @returns {Promise<{instanceMetadataArray: Object[], seriesQuery: Object|null, instancesQuery: Object[],
 *   fallbackCount: number, droppedCount: number, noneReadable: boolean, keptSeriesMetadata: Object[]}>}
 */
async function readSeriesData(reader, studyUID, seriesUID, actualInstanceUIDs) {
  const instanceMetadataArray = [];
  let fallbackCount = 0;
  let droppedCount = 0;

  // Read lazily: only needed when an instance has no readable metadata of its own
  let currentSeriesMetadata;
  let seriesMetadataBySop;
  async function readCurrentSeriesMetadata() {
    if (!currentSeriesMetadata) {
      const current = await reader.readJsonFile(
        reader.getSeriesPath(studyUID, seriesUID),
        'metadata'
      );
      currentSeriesMetadata = Array.isArray(current) ? current : [];
    }
    return currentSeriesMetadata;
  }

  for (const instanceUID of actualInstanceUIDs) {
    const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUID);
    let instanceMetadata = await reader.readJsonFile(instancePath, 'metadata', {
      deleteFileOnError: true,
    });
    if (instanceMetadata) {
      if (Array.isArray(instanceMetadata) && instanceMetadata.length > 0) {
        instanceMetadata = instanceMetadata[0];
      }
      instanceMetadata = updateLocation(instanceMetadata, instanceUID);
      instanceMetadataArray.push(instanceMetadata);
      continue;
    }

    if (!seriesMetadataBySop) {
      seriesMetadataBySop = new Map();
      for (const instance of await readCurrentSeriesMetadata()) {
        const sopUID = getValue(instance, Tags.SOPInstanceUID);
        if (sopUID) {
          seriesMetadataBySop.set(sopUID, instance);
        }
      }
    }
    const seriesInstanceMetadata = seriesMetadataBySop.get(instanceUID);
    if (seriesInstanceMetadata) {
      instanceMetadataArray.push(seriesInstanceMetadata);
      fallbackCount++;
    } else {
      droppedCount++;
    }
  }

  // Instance directories exist but none could be read: keep the current series metadata
  const noneReadable = actualInstanceUIDs.size > 0 && instanceMetadataArray.length === 0;
  const keptSeriesMetadata = noneReadable ? await readCurrentSeriesMetadata() : [];

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

  return {
    instanceMetadataArray,
    seriesQuery,
    instancesQuery,
    fallbackCount,
    droppedCount,
    noneReadable,
    keptSeriesMetadata,
  };
}

/**
 * Returns true when all files of the series level exist: the series metadata,
 * series-singleton.json and instances/index.json. A build of a higher level uses the
 * stored files of a series when this is true, and builds the series otherwise.
 * @param {FileDicomWebReader} reader
 * @param {string} studyUID
 * @param {string} seriesUID
 * @returns {boolean}
 */
export function seriesFilesExist(reader, studyUID, seriesUID) {
  return Boolean(
    reader.seriesFileExists(studyUID, seriesUID, 'series-singleton.json') &&
    reader.seriesFileExists(studyUID, seriesUID, 'metadata') &&
    reader.seriesFileExists(studyUID, seriesUID, 'instances/index.json')
  );
}

/**
 * Creates or updates the series metadata, series-singleton.json and instances/index.json.
 * Returns early, with no write, when the instance UIDs in the series metadata are the
 * same as the instance directories, and series-singleton.json and instances/index.json
 * exist. `force` skips that early return.
 *
 * The series metadata is never written as []: when instance directories exist but no
 * instance metadata is readable (`noneReadable`), the build keeps the current series
 * metadata; a series with no instances stores no metadata. The reader of the build
 * (createBuildReader) throws on an I/O error, so the build then fails and stores nothing.
 *
 * @param {string} baseDir - Base directory for DICOMweb structure
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {Object} [options]
 * @param {boolean} [options.force] - Build the series also when its files are up to date
 * @param {number} [options.generation] - Generation of the series that the build read when it
 *   started (defaults to the current generation). The files commit only if it did not change.
 * @returns {Promise<{committed: boolean, payload?: Object}>} - committed false when the
 *   generation changed; payload is the series data of the build
 */
export async function seriesSummary(baseDir, studyUID, seriesUID, options = {}) {
  if (!baseDir || !studyUID || !seriesUID) {
    throw new Error('baseDir, studyUID, and seriesUID are required');
  }

  // Read the generation before any data, so a change during the scan stops the commit
  const generationKey = seriesGenerationKey(studyUID, seriesUID);
  const generation = options.generation ?? generationTracker.current(generationKey);
  const reader = createBuildReader(baseDir);
  const seriesPath = reader.getSeriesPath(studyUID, seriesUID);
  const instancesPath = `${seriesPath}/instances`;

  // Check if series metadata exists
  let existingInstanceUIDs = new Set();
  const existingMetadata = await reader.readJsonFile(seriesPath, 'metadata', {
    deleteFileOnError: true,
  });
  if (existingMetadata && Array.isArray(existingMetadata)) {
    for (const instance of existingMetadata) {
      const sopUID = getValue(instance, Tags.SOPInstanceUID);
      if (sopUID) {
        existingInstanceUIDs.add(sopUID);
      }
    }
  }

  // Scan the instances directory to get actual instance UIDs
  const actualInstanceUIDs = new Set(await reader.listDirectories(instancesPath));

  // Return early when the metadata lists the stored instances and the other files exist
  if (
    !options.force &&
    existingInstanceUIDs.size === actualInstanceUIDs.size &&
    [...existingInstanceUIDs].every(uid => actualInstanceUIDs.has(uid)) &&
    reader.fileExists(seriesPath, 'series-singleton.json') &&
    reader.fileExists(seriesPath, 'instances/index.json')
  ) {
    console.verbose('seriesSummary: instance index is up to date');
    return { committed: true };
  }

  const informationProvider = { studyInstanceUid: studyUID, seriesInstanceUid: seriesUID };

  // Write all series-level files in one retry loop so readSeriesData is called once per attempt
  console.verbose('seriesSummary: writing series metadata and index files');
  let lastPayload;
  const result = await writeMultipleWithRetry({
    ...options,
    generation: { tracker: generationTracker, key: generationKey, value: generation },
    informationProvider,
    baseDir,
    generatePayload: async () => {
      lastPayload = await readSeriesData(reader, studyUID, seriesUID, actualInstanceUIDs);
      return lastPayload;
    },
    writes: [
      {
        openStream: writer =>
          writer.openSeriesStream('metadata', { gzip: true, compareOnClose: true }),
        getData: data => {
          const metadata = data.noneReadable ? data.keptSeriesMetadata : data.instanceMetadataArray;
          return metadata.length ? JSON.stringify(metadata) : null;
        },
        label: `seriesSummary(${studyUID}/${seriesUID}) metadata`,
      },
      {
        openStream: writer =>
          writer.openSeriesStream('series-singleton.json', { gzip: true, compareOnClose: true }),
        getData: data => (data.seriesQuery ? JSON.stringify([data.seriesQuery]) : null),
        label: `seriesSummary(${studyUID}/${seriesUID}) series-singleton.json`,
      },
      {
        openStream: writer =>
          writer.openSeriesStream('instances/index.json', { gzip: true, compareOnClose: true }),
        getData: data =>
          data?.instancesQuery?.length ? JSON.stringify(data.instancesQuery) : null,
        label: `seriesSummary(${studyUID}/${seriesUID}) instances/index.json`,
      },
    ],
  });

  // Log once, from the last attempt, so a retry does not repeat the warnings
  if (lastPayload) {
    logSeriesDataWarnings(lastPayload, actualInstanceUIDs.size, `${studyUID}/${seriesUID}`);
  }
  return { committed: result.committed, payload: result.payload };
}

/**
 * Logs the instances that seriesSummary could not rebuild from their own metadata.
 * @param {Object} payload - Result of readSeriesData
 * @param {number} instanceCount - Number of instance directories in the series
 * @param {string} seriesLabel - studyUID/seriesUID
 */
function logSeriesDataWarnings(payload, instanceCount, seriesLabel) {
  const { fallbackCount, droppedCount, noneReadable, keptSeriesMetadata } = payload;
  if (fallbackCount > 0) {
    console.warn(
      `seriesSummary: ${fallbackCount} of the ${instanceCount} instances in ${seriesLabel} have no readable instance metadata, keeping their entries from the series metadata`
    );
  }
  if (droppedCount > 0) {
    console.warn(
      `seriesSummary: ${droppedCount} of the ${instanceCount} instances in ${seriesLabel} have no readable instance metadata and no series metadata entry, leaving them out of the series metadata`
    );
  }
  if (noneReadable) {
    console.warn(
      keptSeriesMetadata.length
        ? `seriesSummary: none of the ${instanceCount} instances in ${seriesLabel} have readable metadata, keeping the current series metadata`
        : `seriesSummary: none of the ${instanceCount} instances in ${seriesLabel} have readable metadata, and there is no series metadata to keep`
    );
  }
}
