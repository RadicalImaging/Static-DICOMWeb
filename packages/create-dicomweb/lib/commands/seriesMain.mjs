import { seriesSummary } from '../instance/SeriesSummary.mjs';
import { createBuildReader } from '../instance/FileDicomWebReader.mjs';

/**
 * Main function for processing series metadata
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 * @param {string} [options.seriesUid] - Specific Series Instance UID to process (if not provided, processes all series in the study)
 * @param {boolean} [options.force] - Build each series also when its files are up to date
 * @returns {Promise<{committed: boolean}>} - committed false when a series build did not commit
 */
export async function seriesMain(studyUID, options = {}) {
  const { dicomdir, seriesUid, force } = options;

  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }

  const reader = createBuildReader(dicomdir);

  let seriesUIDs = [];

  if (seriesUid) {
    // Process specific series
    seriesUIDs = [seriesUid];
  } else {
    // Scan for all series in the study
    const seriesPath = reader.getStudyPath(studyUID, { path: 'series' });
    seriesUIDs = await reader.listDirectories(seriesPath);
  }

  if (seriesUIDs.length === 0) {
    console.warn(`No series found for study ${studyUID}`);
    return { committed: true };
  }

  // Process each series
  let committed = true;
  for (const seriesUID of seriesUIDs) {
    try {
      console.verbose(`Processing series ${seriesUID}...`);
      const result = await seriesSummary(dicomdir, studyUID, seriesUID, { force });
      committed &&= result.committed !== false;
      console.noQuiet(`Completed series ${seriesUID}`);
    } catch (error) {
      console.error(`Error processing series ${seriesUID}: ${error.message}`);
      throw error;
    }
  }
  return { committed };
}
