import fs from 'fs';
import path from 'path';
import { FileDicomWebReader } from './FileDicomWebReader.mjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';
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
      const metadata = await reader.readJsonFile(instancePath, 'metadata');
      if (metadata) {
        return Array.isArray(metadata) && metadata.length > 0 ? metadata[0] : metadata;
      }
    }
  }
  return undefined;
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

  // Step 1: Check if series/index.json.gz exists
  const seriesIndexPath = `${seriesPath}`;
  console.noQuiet('studySummary: seriesIndexFileInfo:', seriesIndexPath);

  let existingSeriesUIDs = new Set();

  try {
    const existingSeriesIndex = await reader.readJsonFile(seriesIndexPath, 'index.json');

    if (existingSeriesIndex) {
      // Extract Series Instance UIDs from existing series index
      for (const seriesQuery of existingSeriesIndex) {
        const seriesUID = getValue(seriesQuery, Tags.SeriesInstanceUID);
        if (seriesUID) {
          existingSeriesUIDs.add(seriesUID);
        }
      }

      console.noQuiet('studySummary: existingSeriesUIDs:', existingSeriesUIDs.size);
    }
  } catch (error) {
    console.warn('Failed to read existing series index:', error.message);
    existingSeriesUIDs = new Set();
  }

  // Step 2: Scan the series directory to get actual series UIDs
  const seriesDirectories = await reader.scanDirectory(seriesPath, { withFileTypes: true });
  const actualSeriesUIDs = new Set();
  console.noQuiet('studySummary: seriesDirectories:', seriesPath, seriesDirectories.length);
  for (const entry of seriesDirectories) {
    // If withFileTypes is used, entry is a Dirent object
    if (entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory()) {
      actualSeriesUIDs.add(entry.name);
    } else if (typeof entry === 'string') {
      // Fallback: if entry is a string, check if it's a directory
      const seriesDirPath = `${seriesPath}/${entry}`;
      const fullSeriesPath = path.join(reader.baseDir, seriesDirPath);

      try {
        const stats = fs.lstatSync(fullSeriesPath);
        if (stats.isDirectory()) {
          actualSeriesUIDs.add(entry);
        }
      } catch (error) {
        // Skip if we can't stat the path
        console.warn(`Could not stat ${seriesDirPath}: ${error.message}`);
      }
    }
  }

  // Step 3: Compare sets - if they match exactly, return early
  if (
    existingSeriesUIDs.size === actualSeriesUIDs.size &&
    [...existingSeriesUIDs].every(uid => actualSeriesUIDs.has(uid))
  ) {
    console.noQuiet('studySummary: series index is up to date');
    return; // Series index is up to date
  }

  // Step 4: Read all series singleton files and collect them
  const seriesQueryArray = [];
  let firstSeriesSingleton = null;
  let totalInstances = 0;

  for (const seriesUID of actualSeriesUIDs) {
    const seriesSingletonPath = reader.getSeriesPath(studyUID, seriesUID);

    try {
      let seriesSingleton = await reader.readJsonFile(seriesSingletonPath, 'series-singleton.json');

      if (seriesSingleton) {
        // Series singleton files are arrays with one element
        if (Array.isArray(seriesSingleton) && seriesSingleton.length > 0) {
          seriesSingleton = seriesSingleton[0];
        }

        // Store first series singleton for study query extraction
        if (!firstSeriesSingleton) {
          firstSeriesSingleton = seriesSingleton;
        }

        // Add to series query array
        seriesQueryArray.push(seriesSingleton);

        // Accumulate instance count
        const numberOfInstances = getValue(seriesSingleton, Tags.NumberOfSeriesRelatedInstances);
        if (numberOfInstances !== undefined) {
          totalInstances += Number(numberOfInstances) || 0;
        }
      } else {
        console.noQuiet('studySummary: series singleton file not found:', seriesSingletonPath);
      }
    } catch (error) {
      console.warn(`Failed to read series singleton for series ${seriesUID}: ${error.message}`);
    }
  }

  // Step 5: Sort series by SeriesNumber
  seriesQueryArray.sort((a, b) => {
    const seriesNumberA = getValue(a, Tags.SeriesNumber);
    const seriesNumberB = getValue(b, Tags.SeriesNumber);

    // Convert to numbers if possible, otherwise compare as strings
    const numA = seriesNumberA !== undefined ? Number(seriesNumberA) : Number.MAX_SAFE_INTEGER;
    const numB = seriesNumberB !== undefined ? Number(seriesNumberB) : Number.MAX_SAFE_INTEGER;

    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }

    // Fallback to string comparison
    const strA = String(seriesNumberA || '');
    const strB = String(seriesNumberB || '');
    return strA.localeCompare(strB);
  });

  // Step 6: Extract study query - must use PatientStudyQuery from instance metadata
  // since series singleton only has SeriesQuery (no patient/study-level data)
  let studyQuery = null;
  const firstInstanceMetadata = await getFirstInstanceMetadata(reader, studyUID, actualSeriesUIDs);

  if (firstInstanceMetadata) {
    studyQuery = TagLists.extract(firstInstanceMetadata, 'study', TagLists.PatientStudyQuery);
  }
  if (!studyQuery && firstSeriesSingleton) {
    // Fallback if no instance metadata (e.g. series-only structure)
    studyQuery = TagLists.extract(firstSeriesSingleton, 'study', TagLists.StudyQuery);
  }
  if (studyQuery) {
    setValue(studyQuery, Tags.NumberOfStudyRelatedSeries, seriesQueryArray.length);
    setValue(studyQuery, Tags.NumberOfStudyRelatedInstances, totalInstances);

    // ModalitiesInStudy: unique Modality values from all series
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

  // Step 7: Write series/index.json.gz and study singleton
  const writer = new FileDicomWebWriter({ studyInstanceUid: studyUID }, { baseDir });

  if (seriesQueryArray.length > 0) {
    console.noQuiet('studySummary: writing new series index file');
    const seriesIndexStreamInfo = await writer.openStudyStream('series/index.json', { gzip: true });
    seriesIndexStreamInfo.stream.write(Buffer.from(JSON.stringify(seriesQueryArray)));
    await writer.closeStream(seriesIndexStreamInfo.streamKey);
    console.noQuiet('studySummary: series/index.json file written:', seriesIndexStreamInfo.filepath);
  }

  // Step 8: Write study singleton (studies/${studyUID}/index.json.gz)
  if (studyQuery) {
    console.noQuiet('studySummary: writing new study singleton file');
    const studySingletonStreamInfo = await writer.openStudyStream('index.json', { gzip: true });
    studySingletonStreamInfo.stream.write(Buffer.from(JSON.stringify([studyQuery])));
    await writer.closeStream(studySingletonStreamInfo.streamKey);
    console.noQuiet('studySummary: study singleton file written:', studySingletonStreamInfo.filepath);
  }
}
