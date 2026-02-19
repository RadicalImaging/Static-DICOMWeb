import { instanceMain } from './instanceMain.mjs';
import { seriesMain } from './seriesMain.mjs';
import { studyMain } from './studyMain.mjs';
import { indexSummary } from '../instance/IndexSummary.mjs';

/**
 * Main function for creating complete DICOMweb structure
 * Processes instances, then generates series and study metadata for each study
 * @param {string|string[]} fileNames - File(s) or directory(ies) to process
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 * @param {boolean} [options.studyIndex=true] - Whether to create/update studies/index.json.gz file
 */
export async function createMain(fileNames, options = {}) {
  const { dicomdir, studyIndex = true } = options;

  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }

  // Step 1: Process instances and collect study UIDs
  console.log('Processing instances...');
  const studyUIDs = await instanceMain(fileNames, options);

  if (studyUIDs.size === 0) {
    console.warn('No study UIDs found in processed instances');
    return;
  }

  console.log(`Found ${studyUIDs.size} unique study(ies)`);

  // Step 2: For each study UID, process series and then study metadata
  for (const studyUID of studyUIDs) {
    try {
      // Process series for this study
      console.noQuiet(`Processing series for study ${studyUID}...`);
      await seriesMain(studyUID, options);

      // Process study metadata right after series
      console.noQuiet(`Processing study metadata for study ${studyUID}...`);
      await studyMain(studyUID, options);

      console.noQuiet(`Completed processing for study ${studyUID}`);
    } catch (error) {
      console.error(`Error processing study ${studyUID}: ${error.message}`);
      throw error;
    }
  }

  // Step 3: Create/update studies/index.json.gz file unless disabled
  if (studyIndex) {
    console.noQuiet('Creating/updating studies index...');
    const studyUIDsArray = Array.from(studyUIDs);
    await indexSummary(dicomdir, studyUIDsArray);
  }

  console.log('Completed all processing');
}
