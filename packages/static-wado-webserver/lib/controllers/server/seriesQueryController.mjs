import fs from 'fs';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { FileDicomWebReader } from '@radicalimaging/create-dicomweb';
import { seriesSingleMap, qidoMap, getDicomKey } from '../../adapters/requestAdapters.mjs';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import {
  ensureSeriesLevel,
  ensureStudyLevel,
  sendBuildPayload,
  handleBuildError,
} from './indexOnDemandController.mjs';

/**
 * seriesQueryController: for GET /studies/:studyUID/series. Serves the stored file when it
 * exists, with no other check. Otherwise builds the missing level in the build job manager:
 * with SeriesInstanceUID in the query, the series level of that series (ensureSeriesLevel);
 * without it, the study level (ensureStudyLevel), which writes series/index.json.
 * When the build did not commit, sends the data of the first round. When the build
 * queue is full, answers 503 with Retry-After.
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

    if (createOnDemand && !fs.existsSync(responsePath)) {
      try {
        const options = {
          reader: new FileDicomWebReader(root),
          jobs: getBuildJobManager(params),
          studyIndex: params.studyIndex,
        };
        const result = seriesUIDFromQuery
          ? await ensureSeriesLevel(root, studyUID, seriesUIDFromQuery, options)
          : await ensureStudyLevel(root, studyUID, options);
        const data = seriesUIDFromQuery
          ? result?.payload?.seriesQuery && [result.payload.seriesQuery]
          : result?.payload?.seriesQueryArray;
        if (data?.length && !fs.existsSync(responsePath)) {
          return sendBuildPayload(res, data);
        }
      } catch (err) {
        return handleBuildError(err, res, next, 'indexOnDemand: failed to create series index');
      }
    }
    seriesSingleMap(req, res, next);
  };
}

/**
 * instancesQueryController: for GET /studies/:studyUID/series/:seriesUID/instances. When
 * instances/index.json is missing, builds the series level (ensureSeriesLevel), then
 * invokes qidoMap. When the build did not commit, sends the data of the first round.
 *
 * @param {string} dir - Static files directory path (DICOMweb root)
 * @param {object} params - Server params (rootDir, createIndexOnDemand)
 * @returns {function} Express middleware (req, res, next)
 */
export function instancesQueryController(dir, params = {}) {
  return async function instancesQueryControllerHandler(req, res, next) {
    const root = handleHomeRelative(dir ?? params.rootDir);
    const responsePath = `${root}${req.staticWadoPath}/index.json.gz`;
    if (root && params.createIndexOnDemand !== false && !fs.existsSync(responsePath)) {
      try {
        const { studyUID, seriesUID } = req.params;
        const result = await ensureSeriesLevel(root, studyUID, seriesUID, {
          jobs: getBuildJobManager(params),
        });
        const data = result?.payload?.instancesQuery;
        if (data?.length && !fs.existsSync(responsePath)) {
          return sendBuildPayload(res, data);
        }
      } catch (err) {
        return handleBuildError(err, res, next, 'indexOnDemand: failed to create instances index');
      }
    }
    qidoMap(req, res, next);
  };
}
