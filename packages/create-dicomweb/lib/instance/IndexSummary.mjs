import fs from 'fs';
import path from 'path';
import { FileDicomWebReader } from './FileDicomWebReader.mjs';
import { writeWithRetry } from './writeWithRetry.mjs';
import { Tags, sortStudies } from '@radicalimaging/static-wado-util';

const { getValue } = Tags;

/**
 * Reads existing studies index and study singletons, merges them, and returns
 * the final sorted studies index array as JSON.
 * @param {FileDicomWebReader} reader
 * @param {Set<string>} studiesToProcess
 * @returns {Promise<string>} - JSON string of the final studies index
 */
async function buildStudiesIndex(reader, studiesToProcess) {
  const studiesIndexPath = 'studies';

  // Read existing studies/index.json.gz
  const existingStudyUIDs = new Map();
  const existingData = await reader.readJsonFile(studiesIndexPath, 'index.json', { deleteFileOnError: true });
  if (existingData && Array.isArray(existingData)) {
    for (const studyQuery of existingData) {
      const studyUID = getValue(studyQuery, Tags.StudyInstanceUID);
      if (studyUID) {
        existingStudyUIDs.set(studyUID, studyQuery);
      }
    }
  }

  // Read study singleton files for each study to process
  const updatedStudyUIDs = new Map();
  for (const studyUID of studiesToProcess) {
    const studyPath = reader.getStudyPath(studyUID);
    const studySingleton = await reader.readJsonFile(studyPath, 'index.json', { deleteFileOnError: true });
    if (studySingleton) {
      let studyQuery = Array.isArray(studySingleton) && studySingleton.length > 0
        ? studySingleton[0]
        : studySingleton;
      const studyUIDFromQuery = getValue(studyQuery, Tags.StudyInstanceUID);
      if (studyUIDFromQuery) {
        updatedStudyUIDs.set(studyUIDFromQuery, studyQuery);
        console.verbose(`indexSummary: read study singleton for ${studyUIDFromQuery}`);
      } else {
        console.warn(`indexSummary: study singleton for ${studyUID} missing StudyInstanceUID`);
      }
    } else {
      console.noQuiet(`indexSummary: study singleton file not found for ${studyUID}`);
    }
  }

  // Build the updated studies index
  const finalStudiesIndex = [];
  const processedUIDs = new Set(updatedStudyUIDs.keys());

  for (const [studyUID, studyQuery] of existingStudyUIDs.entries()) {
    if (!processedUIDs.has(studyUID)) {
      const studyPath = reader.getStudyPath(studyUID);
      const studyDirPath = path.join(reader.baseDir, studyPath);
      if (fs.existsSync(studyDirPath) && fs.lstatSync(studyDirPath).isDirectory()) {
        finalStudiesIndex.push(studyQuery);
      } else {
        console.noQuiet(`indexSummary: removing study ${studyUID} from index (directory not found)`);
      }
    }
  }

  for (const [studyUID, studyQuery] of updatedStudyUIDs.entries()) {
    finalStudiesIndex.push(studyQuery);
  }

  sortStudies(finalStudiesIndex);
  return JSON.stringify(finalStudiesIndex);
}

/**
 * Creates or updates studies/index.json.gz file by adding/updating study information
 *
 * @param {string} baseDir - Base directory for DICOMweb structure
 * @param {string[]} studyUIDs - Optional array of Study Instance UIDs to process (if empty, scans all studies)
 * @returns {Promise<void>}
 */
export async function indexSummary(baseDir, studyUIDs = []) {
  if (!baseDir) {
    throw new Error('baseDir is required');
  }

  const reader = new FileDicomWebReader(baseDir);
  const studiesIndexPath = 'studies';

  // Determine which studies to process
  let studiesToProcess = new Set();

  if (studyUIDs.length === 0) {
    console.noQuiet('indexSummary: scanning studies directory for all studies');
    const studiesPath = path.join(reader.baseDir, studiesIndexPath);

    if (fs.existsSync(studiesPath)) {
      const studyDirectories = await reader.scanDirectory(studiesIndexPath, { withFileTypes: true });

      for (const entry of studyDirectories) {
        if (entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory()) {
          studiesToProcess.add(entry.name);
        } else if (typeof entry === 'string') {
          const studyDirPath = `${studiesIndexPath}/${entry}`;
          const fullStudyPath = path.join(reader.baseDir, studyDirPath);
          try {
            const stats = fs.lstatSync(fullStudyPath);
            if (stats.isDirectory()) {
              studiesToProcess.add(entry);
            }
          } catch (error) {
            console.warn(`Could not stat ${studyDirPath}: ${error.message}`);
          }
        }
      }
    }
  } else {
    for (const studyUID of studyUIDs) {
      studiesToProcess.add(studyUID);
    }
  }

  console.noQuiet(`indexSummary: processing ${studiesToProcess.size} studies`);

  // Write the updated studies/index.json.gz file with retry
  console.noQuiet('indexSummary: writing updated studies index');

  // Use an empty informationProvider since we're writing at the root studies level
  await writeWithRetry({
    informationProvider: {},
    baseDir,
    openStream: (writer) => writer.openStream(studiesIndexPath, 'index.json', { gzip: true, compareOnClose: true }),
    generateData: () => buildStudiesIndex(reader, studiesToProcess),
    label: 'indexSummary studies/index.json',
  });
}
