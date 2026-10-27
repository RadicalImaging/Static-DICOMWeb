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
 * Serves standard WADO-RS study metadata by combining the generated metadata
 * arrays for every series in the study. When a series with no stored metadata needs a build
 * (seriesNeedsBuild), builds those series in one job of the build job manager (each series as
 * a nested job), and uses the data of the first round for a series whose build did not
 * commit.
 *
 * The files are read with a build reader on the path of the request: a missing or corrupt
 * file counts as missing (a corrupt file is deleted, so a later request builds it again), and
 * an I/O error answers 503 with Retry-After (handleBuildError), as does a full build queue.
 * With builds on demand, a series that stores no metadata (no readable data) adds no
 * instances. Without them, a series with no stored metadata gives 404 for the study.
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
      const withoutMetadata = () =>
        seriesUIDs.filter(seriesUID => !reader.fileExists(seriesPath(seriesUID), 'metadata'));

      let built;
      if (createOnDemand) {
        const needsBuild = async () => {
          for (const seriesUID of withoutMetadata()) {
            if (await seriesNeedsBuild(reader, studyUID, seriesUID)) {
              return true;
            }
          }
          return false;
        };
        if (await needsBuild()) {
          const result = await getBuildJobManager(params).run(
            `study-metadata:${studyUID}`,
            needsBuild,
            async context => {
              const payload = new Map();
              for (const seriesUID of withoutMetadata()) {
                const seriesResult = await ensureSeriesLevel(root, studyUID, seriesUID, {
                  reader,
                  context,
                });
                payload.set(seriesUID, seriesMetadataOf(seriesResult));
              }
              // Each series job starts its own next round, so this job does not
              return { committed: true, payload };
            }
          );
          built = result?.payload;
        }
      }

      const metadata = [];
      for (const seriesUID of seriesUIDs) {
        const seriesMetadata = await reader.readJsonFile(seriesPath(seriesUID), 'metadata', {
          deleteFileOnError: true,
        });
        if (!seriesMetadata && !createOnDemand) {
          return res.status(404).json([]);
        }
        metadata.push(...(seriesMetadata ?? built?.get(seriesUID) ?? []));
      }

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
