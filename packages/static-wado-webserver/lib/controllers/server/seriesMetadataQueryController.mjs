import fs from 'fs';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { otherJsonMap } from '../../adapters/requestAdapters.mjs';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import {
  ensureSeriesLevel,
  sendBuildPayload,
  seriesMetadataOf,
  handleBuildError,
  serveStored,
} from './indexOnDemandController.mjs';

/**
 * seriesMetadataQueryController: for GET /studies/:studyUID/series/:seriesUID/metadata.
 * When the series metadata file is missing, builds the series level in the build job
 * manager (ensureSeriesLevel), then serves the stored file (serveStored). Each caller of a
 * build sends the data of its round. When the build queue is full, or the storage cannot be
 * read, answers 503 (handleBuildError).
 *
 * @param {string} dir - Static files directory path (DICOMweb root)
 * @param {object} params - Server params (rootDir, createIndexOnDemand)
 * @returns {function} Express middleware (req, res, next)
 */
export function seriesMetadataQueryController(dir, params = {}) {
  return async function seriesMetadataQueryControllerHandler(req, res, next) {
    const root = handleHomeRelative(dir ?? params.rootDir);
    if (!root) {
      return otherJsonMap(req, res, next);
    }
    const createOnDemand = params.createIndexOnDemand !== false;
    const studyUID = req.params.studyUID;
    const seriesUID = req.params.seriesUID;
    const metadataPath = `${root}${req.staticWadoPath}.gz`;
    const label = 'seriesMetadataQuery: failed to create series metadata';
    const build = async () =>
      seriesMetadataOf(
        await ensureSeriesLevel(root, studyUID, seriesUID, { jobs: getBuildJobManager(params) })
      );

    if (createOnDemand && !fs.existsSync(metadataPath)) {
      try {
        const data = await build();
        if (data?.length) {
          return sendBuildPayload(res, data);
        }
      } catch (err) {
        return handleBuildError(err, res, next, label);
      }
    }
    serveStored(root, otherJsonMap, req, res, next, createOnDemand && build, label);
  };
}
