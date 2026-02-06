import fs from 'fs';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { seriesMain } from '@radicalimaging/create-dicomweb';
import { otherJsonMap } from '../../adapters/requestAdapters.mjs';

/**
 * seriesMetadataQueryController: for GET /studies/:studyUID/series/:seriesUID/metadata.
 * When the series metadata file is missing, calls seriesMain for that series to create it
 * on demand, then invokes otherJsonMap.
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
        await seriesMain(studyUID, { dicomdir: root, seriesUid: seriesUID });
      }
    } catch (err) {
      console.error(
        'seriesMetadataQuery: failed to create series metadata:',
        err?.message || err
      );
      return next(err);
    }
    otherJsonMap(req, res, next);
  };
}
