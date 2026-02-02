import { logger } from '@radicalimaging/static-wado-util';
import { studySummary } from '../instance/StudySummary.mjs';

const { createDicomwebLog } = logger;

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
    createDicomwebLog.info(`Processing study ${studyUID}...`);
    await studySummary(dicomdir, studyUID);
    createDicomwebLog.info(`Completed study ${studyUID}`);
  } catch (error) {
    createDicomwebLog.error(`Error processing study ${studyUID}: ${error.message}`);
    throw error;
  }
}
