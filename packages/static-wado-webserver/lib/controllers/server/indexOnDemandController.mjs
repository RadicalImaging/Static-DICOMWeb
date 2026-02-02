import path from 'path';
import fs from 'fs';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { indexMain } from '@radicalimaging/create-dicomweb';
import { studySingleMap, getDicomKey } from '../../adapters/requestAdapters.mjs';

const STUDIES_INDEX_FILE = path.join('studies', 'index.json.gz');

/**
 * Returns true if the request path is a query for the studies index (directory
 * that would be served by studies/index.json.gz).
 *
 * @param {string} requestPath - Normalized path (e.g. req.path or req.staticWadoPath)
 * @returns {boolean}
 */
export function isStudiesIndexRequest(requestPath) {
  if (!requestPath || typeof requestPath !== 'string') {
    return false;
  }
  const normalized = requestPath.replace(/\/+$/, '') || '/';
  return normalized === '/studies';
}

/**
 * Ensures the studies index file exists at the given root directory, creating
 * it via indexMain if missing. Honors params.studyIndex and params.createIndexOnDemand.
 *
 * @param {string} dir - Static files root directory (DICOMweb root)
 * @param {object} params - Server params (rootDir, studyIndex, createIndexOnDemand)
 * @returns {Promise<boolean>} - true if index existed or was created, false if creation skipped
 */
export async function ensureStudiesIndex(dir, params = {}) {
  const root = handleHomeRelative(dir ?? params.rootDir);
  if (!root) {
    return false;
  }
  const createOnDemand = params.createIndexOnDemand !== false;
  if (!createOnDemand) {
    return false;
  }
  const indexPath = path.join(root, STUDIES_INDEX_FILE);
  if (fs.existsSync(indexPath)) {
    return true;
  }
  await indexMain([], { dicomdir: root });
  return true;
}

/**
 * studyQueryController: when the request is for the studies index
 * (no StudyInstanceUID in query) and the index file does not exist, calls indexMain
 * to create it, then invokes studySingleMap.
 *
 * @param {string} dir - Static files directory path (DICOMweb root)
 * @param {object} params - Server params (rootDir, createIndexOnDemand)
 * @returns {function} Express middleware (req, res, next)
 */
export function studyQueryController(dir, params = {}) {
  return async function studyQueryControllerHandler(req, res, next) {
    const studyUID = getDicomKey('0020000d', 'studyinstanceuid', req.query);
    if (!studyUID) {
      try {
        await ensureStudiesIndex(dir, params);
      } catch (err) {
        console.error('indexOnDemand: failed to create studies index:', err?.message || err);
        return next(err);
      }
    }
    studySingleMap(req, res, next);
  };
}
