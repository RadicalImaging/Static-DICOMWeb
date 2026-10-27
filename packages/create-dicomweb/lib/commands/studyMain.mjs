import { studySummary } from '../instance/StudySummary.mjs';
import { seriesSummary, seriesFilesExist } from '../instance/SeriesSummary.mjs';
import { FileDicomWebReader } from '../instance/FileDicomWebReader.mjs';

/**
 * Main function for processing study metadata. First builds each series that has a
 * missing file (without force), and uses the stored files of the other series. Then
 * builds the study files.
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 * @param {boolean} [options.force] - Build the study files also when they are up to date. Does
 *   not build a series whose files exist.
 * @param {number} [options.generation] - Generation of the study that the build read when it started
 * @param {(seriesUID: string) => Promise<*>} [options.buildSeries] - Builds one series that has a
 *   missing file. Defaults to seriesSummary. A server passes a nested job of its job manager.
 * @returns {Promise<{committed: boolean, payload?: Object}>} - Result of studySummary
 */
export async function studyMain(studyUID, options = {}) {
  const { dicomdir, force, generation } = options;
  // Each series build reads the generation of its own series
  const buildSeries =
    options.buildSeries ?? (seriesUID => seriesSummary(dicomdir, studyUID, seriesUID));

  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }

  if (!studyUID) {
    throw new Error('studyUID is required');
  }

  try {
    console.verbose(`Processing study ${studyUID}...`);
    const reader = new FileDicomWebReader(dicomdir);
    const seriesUIDs = await reader.listDirectories(
      reader.getStudyPath(studyUID, { path: 'series' })
    );
    for (const seriesUID of seriesUIDs) {
      if (!seriesFilesExist(reader, studyUID, seriesUID)) {
        await buildSeries(seriesUID);
      }
    }
    const result = await studySummary(dicomdir, studyUID, { force, generation });
    console.noQuiet(`Completed study ${studyUID}`);
    return result;
  } catch (error) {
    console.error(`Error processing study ${studyUID}: ${error.message}`);
    throw error;
  }
}
