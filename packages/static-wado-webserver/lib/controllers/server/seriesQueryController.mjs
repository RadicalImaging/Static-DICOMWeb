import fs from 'fs';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { seriesSingleMap, qidoMap, getDicomKey } from '../../adapters/requestAdapters.mjs';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import {
  ensureSeriesLevel,
  ensureStudyLevel,
  sendBuildPayload,
  handleBuildError,
  serveStored,
} from './indexOnDemandController.mjs';

/**
 * seriesQueryController: for GET /studies/:studyUID/series. Serves the stored file when it
 * exists, with no other check. Otherwise builds the missing level in the build job manager:
 * with SeriesInstanceUID in the query, the series level of that series (ensureSeriesLevel);
 * without it, the study level (ensureStudyLevel), which writes series/index.json.
 * Each caller of a build sends the data of its round, also when the build did not commit,
 * or an upload deleted the file since. When the build queue is full, or the storage cannot
 * be read, answers 503 with Retry-After (handleBuildError).
 *
 * @param {string} dir - Static files directory path (DICOMweb root)
 * @param {object} params - Server params (rootDir, createIndexOnDemand, maxRunningJobs, maxQueuedJobs)
 * @returns {function} Express middleware (req, res, next)
 */
export function seriesQueryController(dir, params = {}) {
  return async function seriesQueryControllerHandler(req, res, next) {
    const root = handleHomeRelative(dir ?? params.rootDir);
    if (!root) {
      return seriesSingleMap(req, res, next);
    }
    const createOnDemand = params.createIndexOnDemand !== false;
    const studyUID = req.params.studyUID;
    const seriesUIDFromQuery = getDicomKey('0020000e', 'seriesinstanceuid', req.query);
    const responsePath = seriesUIDFromQuery
      ? `${root}${req.staticWadoPath}/${seriesUIDFromQuery}/series-singleton.json.gz`
      : `${root}${req.staticWadoPath}/index.json.gz`;
    const label = 'indexOnDemand: failed to create series index';
    const build = async () => {
      const options = { jobs: getBuildJobManager(params), studyIndex: params.studyIndex };
      const result = seriesUIDFromQuery
        ? await ensureSeriesLevel(root, studyUID, seriesUIDFromQuery, options)
        : await ensureStudyLevel(root, studyUID, options);
      return seriesUIDFromQuery
        ? result?.payload?.seriesQuery && [result.payload.seriesQuery]
        : result?.payload?.seriesQueryArray;
    };

    if (createOnDemand && !fs.existsSync(responsePath)) {
      try {
        const data = await build();
        if (data?.length) {
          return sendBuildPayload(res, data);
        }
      } catch (err) {
        return handleBuildError(err, res, next, label);
      }
    }
    serveStored(root, seriesSingleMap, req, res, next, createOnDemand && build, label);
  };
}

/**
 * instancesQueryController: for GET /studies/:studyUID/series/:seriesUID/instances. When
 * instances/index.json is missing, builds the series level (ensureSeriesLevel), then
 * serves the stored file (serveStored). Each caller of a build sends the data of its round.
 * When the build queue is full, or the storage cannot be read, answers 503 (handleBuildError).
 *
 * @param {string} dir - Static files directory path (DICOMweb root)
 * @param {object} params - Server params (rootDir, createIndexOnDemand)
 * @returns {function} Express middleware (req, res, next)
 */
export function instancesQueryController(dir, params = {}) {
  return async function instancesQueryControllerHandler(req, res, next) {
    const root = handleHomeRelative(dir ?? params.rootDir);
    if (!root) {
      return qidoMap(req, res, next);
    }
    const createOnDemand = params.createIndexOnDemand !== false;
    const responsePath = `${root}${req.staticWadoPath}/index.json.gz`;
    const label = 'indexOnDemand: failed to create instances index';
    const build = async () => {
      const { studyUID, seriesUID } = req.params;
      const result = await ensureSeriesLevel(root, studyUID, seriesUID, {
        jobs: getBuildJobManager(params),
      });
      return result?.payload?.instancesQuery;
    };

    if (createOnDemand && !fs.existsSync(responsePath)) {
      try {
        const data = await build();
        if (data?.length) {
          return sendBuildPayload(res, data);
        }
      } catch (err) {
        return handleBuildError(err, res, next, label);
      }
    }
    serveStored(root, qidoMap, req, res, next, createOnDemand && build, label);
  };
}
