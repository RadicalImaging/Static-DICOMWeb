import fs from 'fs';
import path from 'path';
import { FileDicomWebReader } from './FileDicomWebReader.mjs';
import { writeWithRetry } from './writeWithRetry.mjs';
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
    const instanceDirs = await reader.scanDirectory(instancesPath, { withFileTypes: true });
    for (const entry of instanceDirs) {
      const instanceUID = entry?.name ?? entry;
      if (typeof instanceUID !== 'string') continue;
      const instancePath = reader.getInstancePath(studyUID, seriesUID, instanceUID);
      const metadata = await reader.readJsonFile(instancePath, 'metadata', { deleteFileOnError: true });
      if (metadata) {
        return Array.isArray(metadata) && metadata.length > 0 ? metadata[0] : metadata;
      }
    }
  }
  return undefined;
}

/**
 * Scans series directory and reads all series singleton data for a study.
 * @param {FileDicomWebReader} reader
 * @param {string} studyUID
 * @returns {Promise<{actualSeriesUIDs: Set<string>, seriesQueryArray: Object[], studyQuery: Object|null}>}
 */
async function readStudyData(reader, studyUID) {
  const studyPath = reader.getStudyPath(studyUID);
  const seriesPath = `${studyPath}/series`;

  // Scan the series directory to get actual series UIDs
  const seriesDirectories = await reader.scanDirectory(seriesPath, { withFileTypes: true });
  const actualSeriesUIDs = new Set();
  for (const entry of seriesDirectories) {
    if (entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory()) {
      actualSeriesUIDs.add(entry.name);
    } else if (typeof entry === 'string') {
      const seriesDirPath = `${seriesPath}/${entry}`;
      const fullSeriesPath = path.join(reader.baseDir, seriesDirPath);
      try {
        const stats = fs.lstatSync(fullSeriesPath);
        if (stats.isDirectory()) {
          actualSeriesUIDs.add(entry);
        }
      } catch (error) {
        console.verbose(`Could not stat ${seriesDirPath}: ${error.message}`);
      }
    }
  }

  // Read all series singleton files
  const seriesQueryArray = [];
  let firstSeriesSingleton = null;
  let totalInstances = 0;

  for (const seriesUID of actualSeriesUIDs) {
    const seriesSingletonPath = reader.getSeriesPath(studyUID, seriesUID);
    let seriesSingleton = await reader.readJsonFile(seriesSingletonPath, 'series-singleton.json', { deleteFileOnError: true });
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

  return { actualSeriesUIDs, seriesQueryArray, studyQuery };
}

/**
 * Creates or updates study metadata/index.json.gz file
 *
 * @param {string} baseDir - Base directory for DICOMweb structure
 * @param {string} studyUID - Study Instance UID
 * @returns {Promise<void>}
 */
export async function studySummary(baseDir, studyUID) {
  if (!baseDir || !studyUID) {
    throw new Error('baseDir and studyUID are required');
  }

  const reader = new FileDicomWebReader(baseDir);
  const studyPath = reader.getStudyPath(studyUID);
  const seriesPath = `${studyPath}/series`;

  // Check if series/index.json.gz exists and is up to date
  console.verbose('studySummary: seriesIndexFileInfo:', seriesPath);

  let existingSeriesUIDs = new Set();
  const existingSeriesIndex = await reader.readJsonFile(seriesPath, 'index.json', { deleteFileOnError: true });
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
  const seriesDirectories = await reader.scanDirectory(seriesPath, { withFileTypes: true });
  const actualSeriesUIDs = new Set();
  for (const entry of seriesDirectories) {
    if (entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory()) {
      actualSeriesUIDs.add(entry.name);
    } else if (typeof entry === 'string') {
      const seriesDirPath = `${seriesPath}/${entry}`;
      const fullSeriesPath = path.join(reader.baseDir, seriesDirPath);
      try {
        const stats = fs.lstatSync(fullSeriesPath);
        if (stats.isDirectory()) {
          actualSeriesUIDs.add(entry);
        }
      } catch (error) {
        console.verbose(`Could not stat ${seriesDirPath}: ${error.message}`);
      }
    }
  }

  if (
    existingSeriesUIDs.size === actualSeriesUIDs.size &&
    [...existingSeriesUIDs].every(uid => actualSeriesUIDs.has(uid))
  ) {
    console.verbose('studySummary: series index is up to date');
    return;
  }

  const informationProvider = { studyInstanceUid: studyUID };

  // Write series/index.json.gz with retry
  console.verbose('studySummary: writing new series index file');
  await writeWithRetry({
    informationProvider,
    baseDir,
    openStream: (writer) => writer.openStudyStream('series/index.json', { gzip: true, compareOnClose: true }),
    generateData: async () => {
      const data = await readStudyData(reader, studyUID);
      if (data.seriesQueryArray.length === 0) return null;
      return JSON.stringify(data.seriesQueryArray);
    },
    label: `studySummary(${studyUID}) series/index.json`,
  });

  // Write study singleton (studies/${studyUID}/index.json.gz) with retry
  console.verbose('studySummary: writing new study singleton file');
  await writeWithRetry({
    informationProvider,
    baseDir,
    openStream: (writer) => writer.openStudyStream('index.json', { gzip: true, compareOnClose: true }),
    generateData: async () => {
      const data = await readStudyData(reader, studyUID);
      if (!data.studyQuery) return null;
      return JSON.stringify([data.studyQuery]);
    },
    label: `studySummary(${studyUID}) index.json`,
  });
}
