import fs from 'fs';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { otherJsonMap } from '../../adapters/requestAdapters.mjs';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import {
  ensureSeriesLevel,
  sendBuildPayload,
  seriesMetadataOf,
  handleBuildError,
} from './indexOnDemandController.mjs';

/**
 * seriesMetadataQueryController: for GET /studies/:studyUID/series/:seriesUID/metadata.
 * When the series metadata file is missing, builds the series level in the build job
 * manager (ensureSeriesLevel), then invokes otherJsonMap. When the build did not commit,
 * sends the data of the first round.
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

    try {
      if (createOnDemand && !fs.existsSync(metadataPath)) {
        const result = await ensureSeriesLevel(root, studyUID, seriesUID, {
          jobs: getBuildJobManager(params),
        });
        const data = seriesMetadataOf(result);
        if (data?.length && !fs.existsSync(metadataPath)) {
          return sendBuildPayload(res, data);
        }
      }
    } catch (err) {
      return handleBuildError(
        err,
        res,
        next,
        'seriesMetadataQuery: failed to create series metadata'
      );
    }
    otherJsonMap(req, res, next);
  };
}
