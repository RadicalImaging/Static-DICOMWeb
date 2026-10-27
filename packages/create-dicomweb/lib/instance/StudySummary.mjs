import { FileDicomWebReader, createBuildReader } from './FileDicomWebReader.mjs';
import { writeMultipleWithRetry } from './writeWithRetry.mjs';
import { generationTracker } from './generationTracker.mjs';
import { Tags, TagLists } from '@radicalimaging/static-wado-util';

const { getValue, setValue } = Tags;

/**
 * Reads the first available instance metadata in the study (contains full patient/study data)
 * @param {FileDicomWebReader} reader
 * @param {string} studyUID
 * @param {Set<string>} seriesUIDs
 * @returns {Promise<Object|undefined>}
 */
async function getFirstInstanceMetadata(reader, studyUID, seriesUIDs) {
  for (const seriesUID of seriesUIDs) {
    const instancesPath = `${reader.getSeriesPath(studyUID, seriesUID)}/instances`;
    for (const instanceUID of await reader.listDirectories(instancesPath)) {
      const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUID);
      const metadata = await reader.readJsonFile(instancePath, 'metadata', {
        deleteFileOnError: true,
      });
      if (metadata) {
        return Array.isArray(metadata) && metadata.length > 0 ? metadata[0] : metadata;
      }
    }
  }
  return undefined;
}

/**
 * Scans series directory and reads all series singleton data for a study.
 * The reader must use `throwOnIoError`: an I/O error then throws, so the build fails and
 * does not commit an index that leaves out the series (SQR-D3).
 * A series whose series-singleton.json was there at the check but gave no data (a corrupt
 * file that the read deleted, or a file that an upload deleted after the check) is in
 * `unreadSeries`, and the study files must not be stored without it.
 * @param {FileDicomWebReader} reader
 * @param {string} studyUID
 * @param {Map<string, Object>} [pendingSeries] - Series query of each series whose round did not
 *   commit; used when the series has no stored series-singleton.json
 * @returns {Promise<{actualSeriesUIDs: Set<string>, seriesQueryArray: Object[], studyQuery: Object|null,
 *   unreadSeries: string[]}>}
 */
async function readStudyData(reader, studyUID, pendingSeries = new Map()) {
  const studyPath = reader.getStudyPath(studyUID);
  const seriesPath = `${studyPath}/series`;

  // Scan the series directory to get actual series UIDs
  const actualSeriesUIDs = new Set(await reader.listDirectories(seriesPath));

  // Read all series singleton files
  const seriesQueryArray = [];
  let firstSeriesSingleton = null;
  let totalInstances = 0;
  const unreadSeries = [];

  for (const seriesUID of actualSeriesUIDs) {
    const seriesSingletonPath = reader.getSeriesPath(studyUID, seriesUID);
    // Checked before the read, so a file that the read deletes as corrupt is in unreadSeries
    const stored = reader.fileExists(seriesSingletonPath, 'series-singleton.json');
    const storedSingleton = await reader.readJsonFile(
      seriesSingletonPath,
      'series-singleton.json',
      { deleteFileOnError: true, throwIfNotDeleted: true }
    );
    if (stored && !storedSingleton) {
      unreadSeries.push(seriesUID);
    }
    let seriesSingleton = storedSingleton ?? pendingSeries.get(seriesUID);
    if (seriesSingleton) {
      if (Array.isArray(seriesSingleton) && seriesSingleton.length > 0) {
        seriesSingleton = seriesSingleton[0];
      }
      if (!firstSeriesSingleton) {
        firstSeriesSingleton = seriesSingleton;
      }
      seriesQueryArray.push(seriesSingleton);
      const numberOfInstances = getValue(seriesSingleton, Tags.NumberOfSeriesRelatedInstances);
      if (numberOfInstances !== undefined) {
        totalInstances += Number(numberOfInstances) || 0;
      }
    } else {
      console.verbose('studySummary: series singleton file not found:', seriesSingletonPath);
    }
  }

  // Sort series by SeriesNumber
  seriesQueryArray.sort((a, b) => {
    const seriesNumberA = getValue(a, Tags.SeriesNumber);
    const seriesNumberB = getValue(b, Tags.SeriesNumber);
    const numA = seriesNumberA !== undefined ? Number(seriesNumberA) : Number.MAX_SAFE_INTEGER;
    const numB = seriesNumberB !== undefined ? Number(seriesNumberB) : Number.MAX_SAFE_INTEGER;
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    const strA = String(seriesNumberA || '');
    const strB = String(seriesNumberB || '');
    return strA.localeCompare(strB);
  });

  // Extract study query from instance metadata
  let studyQuery = null;
  const firstInstanceMetadata = await getFirstInstanceMetadata(reader, studyUID, actualSeriesUIDs);

  if (firstInstanceMetadata) {
    studyQuery = TagLists.extract(firstInstanceMetadata, 'study', TagLists.PatientStudyQuery);
  }
  if (!studyQuery && firstSeriesSingleton) {
    studyQuery = TagLists.extract(firstSeriesSingleton, 'study', TagLists.StudyQuery);
  }
  if (studyQuery) {
    setValue(studyQuery, Tags.NumberOfStudyRelatedSeries, seriesQueryArray.length);
    setValue(studyQuery, Tags.NumberOfStudyRelatedInstances, totalInstances);

    const modalitiesInStudy = [];
    for (const seriesQuery of seriesQueryArray) {
      const modality = getValue(seriesQuery, Tags.Modality);
      if (modality && modalitiesInStudy.indexOf(modality) === -1) {
        modalitiesInStudy.push(modality);
      }
    }
    if (modalitiesInStudy.length > 0) {
      setValue(studyQuery, Tags.ModalitiesInStudy, modalitiesInStudy);
    }
  }

  return { actualSeriesUIDs, seriesQueryArray, studyQuery, unreadSeries };
}

/**
 * Returns true when both files of the study level exist: series/index.json and the study
 * index.json. A build of the studies list uses the stored files of a study when this is true.
 * @param {FileDicomWebReader} reader
 * @param {string} studyUID
 * @returns {boolean}
 */
export function studyFilesExist(reader, studyUID) {
  return Boolean(
    reader.studyFileExists(studyUID, 'index.json') &&
    reader.fileExists(reader.getStudyPath(studyUID, { path: 'series' }), 'index.json')
  );
}

/**
 * Creates or updates the study files: series/index.json and the study index.json.
 *
 * With `pendingSeries` (a series round of this study round did not commit), builds the study
 * data for the response from the stored series files and the pending series queries, writes
 * nothing, and returns `committed: false`. Stored files without that series would leave it
 * out until the next upload (SQR-D6).
 *
 * When a stored series-singleton.json is corrupt, the read deletes it, and the round stores
 * nothing and returns `committed: false` with `payload.unreadSeries`. The caller builds those
 * series, and builds the study again (studyMain).
 *
 * @param {string} baseDir - Base directory for DICOMweb structure
 * @param {string} studyUID - Study Instance UID
 * @param {Object} [options]
 * @param {boolean} [options.force] - Build the study files also when the series index is up to date
 * @param {number} [options.generation] - Generation of the study that the build read when it
 *   started (defaults to the current generation). The files commit only if it did not change.
 * @param {Map<string, Object>} [options.pendingSeries] - Series UID -> series query (or
 *   undefined) of each series whose round did not commit
 * @returns {Promise<{committed: boolean, payload?: Object}>} - committed false when the
 *   generation changed, a series is pending, or `payload.unreadSeries` is not empty; payload
 *   is the study data of the build
 */
export async function studySummary(baseDir, studyUID, options = {}) {
  if (!baseDir || !studyUID) {
    throw new Error('baseDir and studyUID are required');
  }

  // Read the generation before any data, so a change during the scan stops the commit
  const generation = options.generation ?? generationTracker.current(studyUID);
  // An existence check, a listing or a read with an I/O error fails the build (SQR-D3)
  const reader = createBuildReader(baseDir);
  const studyPath = reader.getStudyPath(studyUID);
  const seriesPath = `${studyPath}/series`;

  if (options.pendingSeries?.size) {
    return {
      committed: false,
      payload: await readStudyData(reader, studyUID, options.pendingSeries),
    };
  }

  // Check if series/index.json.gz exists and is up to date
  console.verbose('studySummary: seriesIndexFileInfo:', seriesPath);

  let existingSeriesUIDs = new Set();
  const existingSeriesIndex = await reader.readJsonFile(seriesPath, 'index.json', {
    deleteFileOnError: true,
  });
  if (existingSeriesIndex) {
    for (const seriesQuery of existingSeriesIndex) {
      const seriesUID = getValue(seriesQuery, Tags.SeriesInstanceUID);
      if (seriesUID) {
        existingSeriesUIDs.add(seriesUID);
      }
    }
    console.verbose('studySummary: existingSeriesUIDs:', existingSeriesUIDs.size);
  }

  // Scan to check if update is needed
  const actualSeriesUIDs = new Set(await reader.listDirectories(seriesPath));

  // No series: nothing to write, and no stream may create the study directory
  if (!actualSeriesUIDs.size) {
    console.verbose('studySummary: no series found');
    return { committed: true };
  }

  if (
    !options.force &&
    existingSeriesUIDs.size === actualSeriesUIDs.size &&
    [...existingSeriesUIDs].every(uid => actualSeriesUIDs.has(uid)) &&
    studyFilesExist(reader, studyUID)
  ) {
    console.verbose('studySummary: series index is up to date');
    return { committed: true };
  }

  const informationProvider = { studyInstanceUid: studyUID };

  // Write both study-level files in one retry loop so readStudyData is called once per attempt
  console.verbose('studySummary: writing series index and study singleton files');
  const { committed, payload } = await writeMultipleWithRetry({
    generation: { tracker: generationTracker, key: studyUID, value: generation },
    informationProvider,
    baseDir,
    generatePayload: () => readStudyData(reader, studyUID),
    writes: [
      {
        openStream: writer =>
          writer.openStudyStream('series/index.json', { gzip: true, compareOnClose: true }),
        getData: data =>
          !data.unreadSeries.length && data.seriesQueryArray.length > 0
            ? JSON.stringify(data.seriesQueryArray)
            : null,
        label: `studySummary(${studyUID}) series/index.json`,
      },
      {
        openStream: writer =>
          writer.openStudyStream('index.json', { gzip: true, compareOnClose: true }),
        getData: data =>
          !data.unreadSeries.length && data.studyQuery ? JSON.stringify([data.studyQuery]) : null,
        label: `studySummary(${studyUID}) index.json`,
      },
    ],
  });
  if (payload?.unreadSeries.length) {
    return { committed: false, payload };
  }
  return { committed, payload };
}
