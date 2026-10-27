import { studySummary } from '../instance/StudySummary.mjs';
import { seriesSummary, seriesFilesExist } from '../instance/SeriesSummary.mjs';
import { createBuildReader } from '../instance/FileDicomWebReader.mjs';
import { generationTracker } from '../instance/generationTracker.mjs';

/**
 * Main function for processing study metadata. First builds each series that has a
 * missing file (without force), and uses the stored files of the other series. Then
 * builds the study files. When the study build finds a corrupt series-singleton.json
 * (`unreadSeries`), builds those series, and builds the study files one more time. When the
 * file is still unreadable after that, and no upload changed the study, throws, so the job
 * fails and starts no next round. After an upload, returns `committed: false`.
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 * @param {boolean} [options.force] - Build the study files also when they are up to date. Does
 *   not build a series whose files exist.
 * @param {number} [options.generation] - Generation of the study that the build read when it started
 * @param {(seriesUID: string) => Promise<*>} [options.buildSeries] - Builds one series that has a
 *   missing file. Defaults to seriesSummary. A server passes a nested job of its job manager.
 * @returns {Promise<{committed: boolean, payload?: Object}>} - Result of studySummary; committed
 *   false also when a series build did not commit
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
    const studyGeneration = generation ?? generationTracker.current(studyUID);
    const reader = createBuildReader(dicomdir);
    const seriesUIDs = await reader.listDirectories(
      reader.getStudyPath(studyUID, { path: 'series' })
    );
    // Series whose round did not commit (also a round that a nested job joined, SQR-D6)
    const pendingSeries = new Map();
    const build = async uids => {
      for (const seriesUID of uids) {
        const seriesResult = await buildSeries(seriesUID);
        if (seriesResult?.committed === false) {
          pendingSeries.set(seriesUID, seriesResult.payload?.seriesQuery);
        }
      }
    };
    await build(seriesUIDs.filter(seriesUID => !seriesFilesExist(reader, studyUID, seriesUID)));
    const summaryOptions = { force, generation: studyGeneration, pendingSeries };
    let result = await studySummary(dicomdir, studyUID, summaryOptions);
    // A series-singleton.json gave no data (corrupt and deleted, or deleted by an upload)
    if (result.payload?.unreadSeries?.length) {
      await build(result.payload.unreadSeries);
      result = await studySummary(dicomdir, studyUID, summaryOptions);
      // An upload changed the study: a next round builds it. Otherwise fail, and start no
      // next rounds that cannot change the result
      if (
        result.payload?.unreadSeries?.length &&
        generationTracker.current(studyUID) === studyGeneration
      ) {
        throw new Error(
          `series-singleton.json of series ${result.payload.unreadSeries.join(', ')} stays unreadable`
        );
      }
    }
    console.noQuiet(`Completed study ${studyUID}`);
    return result;
  } catch (error) {
    console.error(`Error processing study ${studyUID}: ${error.message}`);
    throw error;
  }
}
