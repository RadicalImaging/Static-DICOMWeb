import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { createBuildReader } from '@radicalimaging/create-dicomweb';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import {
  ensureSeriesLevel,
  seriesNeedsBuild,
  seriesMetadataOf,
  handleBuildError,
} from './indexOnDemandController.mjs';

/**
 * Builds the series of `seriesUIDs` that need a build (seriesNeedsBuild), in one job of the
 * build job manager, each series as a nested job.
 * @returns {Promise<Map<string, Object[]>>} - Series UID -> metadata of the first round of its
 *   build (also of a round that did not commit); empty when no build was necessary
 */
async function buildSeriesMetadata(root, studyUID, seriesUIDs, reader, params) {
  const needsBuild = async () => {
    for (const seriesUID of seriesUIDs) {
      if (await seriesNeedsBuild(reader, studyUID, seriesUID)) {
        return true;
      }
    }
    return false;
  };
  if (!(await needsBuild())) {
    return new Map();
  }
  const key = `study-metadata:${studyUID}:${seriesUIDs.join(',')}`;
  const result = await getBuildJobManager(params).run(key, needsBuild, async context => {
    const payload = new Map();
    for (const seriesUID of seriesUIDs) {
      const seriesResult = await ensureSeriesLevel(root, studyUID, seriesUID, { reader, context });
      payload.set(seriesUID, seriesMetadataOf(seriesResult));
    }
    // Each series job starts its own next round, so this job does not
    return { committed: true, payload };
  });
  return result?.payload ?? new Map();
}

/**
 * Serves standard WADO-RS study metadata by combining the generated metadata
 * arrays for every series in the study. Reads the metadata of all series first, in parallel.
 * Then builds the series whose metadata is missing (buildSeriesMetadata), reads those again,
 * and uses the data of the first round for a series whose build did not commit.
 *
 * The files are read with a build reader on the path of the request: a missing or corrupt
 * file counts as missing (a corrupt file is deleted, and then built), and an I/O error
 * answers 503 with Retry-After (handleBuildError), as does a full build queue. With builds
 * on demand, a series that stores no metadata (no readable data) adds no instances. Without
 * them, a series with no stored metadata gives 404 for the study.
 *
 * @param {string} dir Static DICOMweb root directory.
 * @param {object} params Server parameters.
 * @returns {function} Express middleware.
 */
export function studyMetadataQueryController(dir, params = {}) {
  return async function studyMetadataQueryControllerHandler(req, res, next) {
    const root = handleHomeRelative(dir ?? params.rootDir);
    const studyUID = req.params.studyUID;
    const studyPath = req.staticWadoPath.replace(/\/metadata\/?$/, '').replace(/^\/+/, '');
    const seriesPath = seriesUID => `${studyPath}/series/${seriesUID}`;
    const createOnDemand = params.createIndexOnDemand !== false;
    const reader = createBuildReader(root);

    try {
      const seriesUIDs = (await reader.listDirectories(`${studyPath}/series`)).sort((a, b) =>
        a.localeCompare(b)
      );
      const read = seriesUID =>
        reader.readJsonFile(seriesPath(seriesUID), 'metadata', { deleteFileOnError: true });

      // Read first, so a series that an upload changes after its read keeps its data
      const metadataBySeries = await Promise.all(seriesUIDs.map(read));
      const missing = seriesUIDs.filter((_, index) => !metadataBySeries[index]);
      if (missing.length && !createOnDemand) {
        return res.status(404).json([]);
      }

      if (missing.length) {
        const built = await buildSeriesMetadata(root, studyUID, missing, reader, params);
        for (const seriesUID of missing) {
          metadataBySeries[seriesUIDs.indexOf(seriesUID)] =
            (await read(seriesUID)) ?? built.get(seriesUID) ?? [];
        }
      }

      const metadata = metadataBySeries.flat();
      if (!metadata.length) {
        return res.status(404).json([]);
      }
      return res.type('application/dicom+json').send(metadata);
    } catch (error) {
      return handleBuildError(
        error,
        res,
        next,
        'studyMetadataQuery: failed to build series metadata'
      );
    }
  };
}
