import { studySummary } from '../instance/StudySummary.mjs';

/**
 * Main function for processing study metadata
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 */
export async function studyMain(studyUID, options = {}) {
  const { dicomdir } = options;
  
  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }
  
  if (!studyUID) {
    throw new Error('studyUID is required');
  }
  
  try {
    console.noQuiet(`Processing study ${studyUID}...`);
    await studySummary(dicomdir, studyUID);
    console.noQuiet(`Completed study ${studyUID}`);
  } catch (error) {
    console.error(`Error processing study ${studyUID}: ${error.message}`);
    throw error;
  }
}
