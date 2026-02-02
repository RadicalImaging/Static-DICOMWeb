import { logger } from '@radicalimaging/static-wado-util';
import { indexSummary } from '../instance/IndexSummary.mjs';

const { createDicomwebLog } = logger;

/**
 * Main function for processing studies index
 * @param {string[]} studyUIDs - Optional array of Study Instance UIDs to process (if empty, scans all studies)
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 */
export async function indexMain(studyUIDs = [], options = {}) {
  const { dicomdir } = options;
  
  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }
  
  // studyUIDs can be an array or undefined/empty
  const studyUIDsArray = Array.isArray(studyUIDs) ? studyUIDs : (studyUIDs ? [studyUIDs] : []);
  
  try {
    if (studyUIDsArray.length === 0) {
      createDicomwebLog.info('Processing all studies in index...');
    } else {
      createDicomwebLog.info(`Processing ${studyUIDsArray.length} study(ies) in index...`);
    }
    await indexSummary(dicomdir, studyUIDsArray);
    createDicomwebLog.info('Completed studies index update');
  } catch (error) {
    createDicomwebLog.error(`Error processing studies index: ${error.message}`);
    throw error;
  }
}
