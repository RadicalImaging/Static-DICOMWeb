import fs from 'fs';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { seriesMain } from '@radicalimaging/create-dicomweb';
import { seriesSingleMap, getDicomKey } from '../../adapters/requestAdapters.mjs';

/**
 * seriesQueryController: for GET /studies/:studyUID/series. If SeriesInstanceUID
 * is in the query, calls seriesMain for that series when its index is missing;
 * otherwise ensures the study-level series index exists via seriesMain, then
 * invokes seriesSingleMap.
 *
 * @param {string} dir - Static files directory path (DICOMweb root)
 * @param {object} params - Server params (rootDir, createIndexOnDemand)
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

    try {
      if (seriesUIDFromQuery) {
        const singleSeriesPath = `${root}${req.staticWadoPath}/${seriesUIDFromQuery}/series-singleton.json.gz`;
        if (createOnDemand && !fs.existsSync(singleSeriesPath)) {
          await seriesMain(studyUID, { dicomdir: root, seriesUid: seriesUIDFromQuery });
        }
      } else {
        const studySeriesIndexPath = `${root}${req.staticWadoPath}/index.json.gz`;
        if (createOnDemand && !fs.existsSync(studySeriesIndexPath)) {
          await seriesMain(studyUID, { dicomdir: root });
        }
      }
    } catch (err) {
      console.error(
        'indexOnDemand: failed to create series index:',
        err?.message || err
      );
      return next(err);
    }
    seriesSingleMap(req, res, next);
  };
}
