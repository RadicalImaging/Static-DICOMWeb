import fs from 'fs';
import path from 'path';
import { FileDicomWebReader } from './FileDicomWebReader.mjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';
import { Tags, sortStudies, logger } from '@radicalimaging/static-wado-util';

const { createDicomwebLog } = logger;

const { getValue } = Tags;

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
  const studiesIndexFile = 'index.json.gz';

  // Step 1: Read existing studies/index.json.gz if it exists
  let existingStudiesIndex = [];
  const existingStudyUIDs = new Map(); // Map of studyUID -> studyQuery

  try {
    const existingData = await reader.readJsonFile(studiesIndexPath, 'index.json');
    if (existingData && Array.isArray(existingData)) {
      existingStudiesIndex = existingData;
      // Build a map of existing study UIDs
      for (const studyQuery of existingStudiesIndex) {
        const studyUID = getValue(studyQuery, Tags.StudyInstanceUID);
        if (studyUID) {
          existingStudyUIDs.set(studyUID, studyQuery);
        }
      }
      createDicomwebLog.debug(`indexSummary: found ${existingStudiesIndex.length} existing studies in index`);
    }
  } catch (error) {
    createDicomwebLog.warn(`Failed to read existing studies index: ${error.message}`);
    existingStudiesIndex = [];
  }

  // Step 2: Determine which studies to process
  let studiesToProcess = new Set();

  if (studyUIDs.length === 0) {
    // No UIDs provided - scan the studies directory
    createDicomwebLog.debug('indexSummary: scanning studies directory for all studies');
    const studiesPath = path.join(reader.baseDir, studiesIndexPath);

    if (fs.existsSync(studiesPath)) {
      const studyDirectories = await reader.scanDirectory(studiesIndexPath, { withFileTypes: true });

      for (const entry of studyDirectories) {
        // If withFileTypes is used, entry is a Dirent object
        if (entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory()) {
          studiesToProcess.add(entry.name);
        } else if (typeof entry === 'string') {
          // Fallback: if entry is a string, check if it's a directory
          const studyDirPath = `${studiesIndexPath}/${entry}`;
          const fullStudyPath = path.join(reader.baseDir, studyDirPath);

          try {
            const stats = fs.lstatSync(fullStudyPath);
            if (stats.isDirectory()) {
              studiesToProcess.add(entry);
            }
          } catch (error) {
            // Skip if we can't stat the path
            createDicomwebLog.warn(`Could not stat ${studyDirPath}: ${error.message}`);
          }
        }
      }
    }
  } else {
    // Specific UIDs provided - process only those
    for (const studyUID of studyUIDs) {
      studiesToProcess.add(studyUID);
    }
  }

  createDicomwebLog.debug(`indexSummary: processing ${studiesToProcess.size} studies`);

  // Step 3: Read study singleton files for each study to process
  const updatedStudyUIDs = new Map();

  for (const studyUID of studiesToProcess) {
    const studyPath = reader.getStudyPath(studyUID);

    try {
      // Read the study singleton file (studies/{studyUID}/index.json.gz)
      const studySingleton = await reader.readJsonFile(studyPath, 'index.json');

      if (studySingleton) {
        // Study singleton files are arrays with one element
        let studyQuery = Array.isArray(studySingleton) && studySingleton.length > 0
          ? studySingleton[0]
          : studySingleton;

        const studyUIDFromQuery = getValue(studyQuery, Tags.StudyInstanceUID);
        if (studyUIDFromQuery) {
          updatedStudyUIDs.set(studyUIDFromQuery, studyQuery);
          createDicomwebLog.debug(`indexSummary: read study singleton for ${studyUIDFromQuery}`);
        } else {
          createDicomwebLog.debug(`indexSummary: study singleton for ${studyUID} missing StudyInstanceUID`);
        }
      } else {
        createDicomwebLog.warn(`indexSummary: study singleton file not found for ${studyUID}`);
      }
    } catch (error) {
      createDicomwebLog.warn(`Failed to read study singleton for ${studyUID}: ${error.message}`);
    }
  }

  // Step 4: Build the updated studies index
  // Start with existing studies that are NOT being updated
  const finalStudiesIndex = [];
  const processedUIDs = new Set(updatedStudyUIDs.keys());

  for (const [studyUID, studyQuery] of existingStudyUIDs.entries()) {
    if (!processedUIDs.has(studyUID)) {
      // Keep existing study if it's not being updated and still exists
      const studyPath = reader.getStudyPath(studyUID);
      const studyDirPath = path.join(reader.baseDir, studyPath);

      // Check if study directory still exists
      if (fs.existsSync(studyDirPath) && fs.lstatSync(studyDirPath).isDirectory()) {
        finalStudiesIndex.push(studyQuery);
      } else {
        createDicomwebLog.warn(`indexSummary: removing study ${studyUID} from index (directory not found)`);
      }
    }
  }

  // Add/update studies that were processed
  for (const [studyUID, studyQuery] of updatedStudyUIDs.entries()) {
    finalStudiesIndex.push(studyQuery);
  }

  // Step 5: Sort studies by StudyDate and StudyTime (if available)
  sortStudies(finalStudiesIndex);

  // Step 6: Write the updated studies/index.json.gz file
  createDicomwebLog.debug(`indexSummary: writing updated studies index with ${finalStudiesIndex.length} studies`);

  // Use an empty informationProvider since we're writing at the root studies level
  const writer = new FileDicomWebWriter({}, { baseDir });
  const studiesIndexStreamInfo = writer.openStream(studiesIndexPath, 'index.json', { gzip: true });
  studiesIndexStreamInfo.stream.write(Buffer.from(JSON.stringify(finalStudiesIndex)));
  await writer.closeStream(studiesIndexStreamInfo.streamKey);
  createDicomwebLog.debug('indexSummary: studies/index.json.gz file written:', studiesIndexStreamInfo.filepath);
}
