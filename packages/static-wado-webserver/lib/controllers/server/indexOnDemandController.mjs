import path from 'path';
import fs from 'fs';
import { handleHomeRelative, getStudyUIDPathAndSubPath } from '@radicalimaging/static-wado-util';
import {
  indexMain,
  studyMain,
  seriesMain,
  FileDicomWebReader,
} from '@radicalimaging/create-dicomweb';
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
 * Ensures the study index exists for a single study. Uses the reader for directory
 * and existence checks so it can work with non-file storage when a different reader
 * is provided. Before summarizing the study, ensures every series directory has a
 * series index (series-singleton.json); calls seriesMain for any series that does
 * not. Then calls studyMain.
 *
 * @param {string} root - Resolved DICOMweb root directory (baseDir for the reader)
 * @param {string} studyUID - Study Instance UID
 * @param {Object} [options] - Options
 * @param {import('@radicalimaging/create-dicomweb').FileDicomWebReader} [options.reader] - Reader instance (defaults to new FileDicomWebReader(root))
 * @returns {Promise<void>}
 */
async function ensureSingleStudyIndex(root, studyUID, options = {}) {
  const reader = options.reader ?? new FileDicomWebReader(root);

  if (reader.studyFileExists(studyUID, 'index.json')) {
    return;
  }

  const seriesPath = reader.getStudyPath(studyUID, { path: 'series' });
  const seriesEntries = await reader.scanDirectory(seriesPath, {
    withFileTypes: true,
  });

  for (const entry of seriesEntries) {
    const isDir =
      entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory();
    if (!isDir) continue;
    const seriesUID = entry.name;
    if (!reader.seriesFileExists(studyUID, seriesUID, 'series-singleton.json')) {
      await seriesMain(studyUID, { dicomdir: root, seriesUid: seriesUID });
    }
  }

  await studyMain(studyUID, { dicomdir: root });
}

/**
 * studyQueryController: when the request is for the studies index
 * (no StudyInstanceUID in query) and the index file does not exist, calls indexMain
 * to create it; when StudyInstanceUID is in the query and that study's index does
 * not exist, calls studyMain to create it. Then invokes studySingleMap.
 *
 * @param {string} dir - Static files directory path (DICOMweb root)
 * @param {object} params - Server params (rootDir, createIndexOnDemand, hashStudyUidPath)
 * @returns {function} Express middleware (req, res, next)
 */
export function studyQueryController(dir, params = {}) {
  return async function studyQueryControllerHandler(req, res, next) {
    const root = handleHomeRelative(dir ?? params.rootDir);
    const studyUID = getDicomKey('0020000d', 'studyinstanceuid', req.query);
    const createOnDemand = params.createIndexOnDemand !== false;
    const hashStudyUidPath = params.hashStudyUidPath === true;

    try {
      if (studyUID) {
        // Single-study case: ensure this study's index exists (series indices first, then study)
        if (createOnDemand && root) {
          await ensureSingleStudyIndex(root, studyUID);
        }
        // Point staticWadoPath at the study so studySingleMap serves study/index.json.gz
        if (hashStudyUidPath) {
          const { path: hashPath = '', subpath: hashSubpath = '' } =
            getStudyUIDPathAndSubPath(studyUID);
          const hashPrefix = [hashPath, hashSubpath].filter(Boolean).join('/');
          req.staticWadoPath = hashPrefix
            ? `/studies/${hashPrefix}/${studyUID}`
            : `/studies/${studyUID}`;
        } else {
          req.staticWadoPath = `/studies/${studyUID}`;
        }
      } else {
        // Studies list: ensure studies index exists
        await ensureStudiesIndex(dir, params);
      }
    } catch (err) {
      console.error('indexOnDemand: failed to create studies index:', err?.message || err);
      return next(err);
    }
    studySingleMap(req, res, next);
  };
}
