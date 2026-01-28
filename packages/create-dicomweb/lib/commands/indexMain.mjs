import { indexSummary } from '../instance/IndexSummary.mjs';

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
      console.log('Processing all studies in index...');
    } else {
      console.log(`Processing ${studyUIDsArray.length} study(ies) in index...`);
    }
    await indexSummary(dicomdir, studyUIDsArray);
    console.log('Completed studies index update');
  } catch (error) {
    console.error(`Error processing studies index: ${error.message}`);
    throw error;
  }
}
