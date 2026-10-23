import { studySummary } from '../instance/StudySummary.mjs';

/**
 * Main function for processing study metadata
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 * @param {number} [options.generation] - Generation of the study that the build read when it started
 * @returns {Promise<{committed: boolean, payload?: Object}>} - Result of studySummary
 */
export async function studyMain(studyUID, options = {}) {
  const { dicomdir, generation } = options;

  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }

  if (!studyUID) {
    throw new Error('studyUID is required');
  }

  try {
    console.verbose(`Processing study ${studyUID}...`);
    const result = await studySummary(dicomdir, studyUID, { generation });
    console.noQuiet(`Completed study ${studyUID}`);
    return result;
  } catch (error) {
    console.error(`Error processing study ${studyUID}: ${error.message}`);
    throw error;
  }
}
