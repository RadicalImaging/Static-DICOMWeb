import {
  handleHomeRelative,
  getStudyUIDPathAndSubPath,
  QueueFullError,
} from '@radicalimaging/static-wado-util';
import {
  indexSummary,
  studyMain,
  seriesSummary,
  FileDicomWebReader,
  generationTracker,
} from '@radicalimaging/create-dicomweb';
import { studySingleMap, getDicomKey } from '../../adapters/requestAdapters.mjs';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';

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
 * Lists the directory names in a directory of the reader.
 * @param {FileDicomWebReader} reader
 * @param {string} relativePath
 * @returns {Promise<string[]>}
 */
async function listDirectories(reader, relativePath) {
  const entries = await reader.scanDirectory(relativePath, { withFileTypes: true });
  return entries
    .filter(entry => entry && typeof entry === 'object' && entry.isDirectory?.())
    .map(entry => entry.name);
}

/**
 * Runs a build as a nested job when a job context is given, otherwise as a top-level job.
 * @param {Object} options - { context, jobs, background }
 */
function runJob(options, key, needsBuild, fn) {
  if (options.context) {
    return options.context.child(key, needsBuild, fn);
  }
  const jobs = options.jobs ?? getBuildJobManager();
  return jobs.run(key, needsBuild, fn, { background: options.background === true });
}

/**
 * Returns true when all files of the series level exist: the series metadata,
 * series-singleton.json and instances/index.json.
 */
function seriesFilesExist(reader, studyUID, seriesUID) {
  return Boolean(
    reader.seriesFileExists(studyUID, seriesUID, 'series-singleton.json') &&
    reader.seriesFileExists(studyUID, seriesUID, 'metadata') &&
    reader.seriesFileExists(studyUID, seriesUID, 'instances/index.json')
  );
}

/** Returns true when both files of the study level exist: series/index.json and index.json */
function studyFilesExist(reader, studyUID) {
  return Boolean(
    reader.studyFileExists(studyUID, 'index.json') &&
    reader.fileExists(reader.getStudyPath(studyUID, { path: 'series' }), 'index.json')
  );
}

/**
 * Ensures that the series level of one series exists, and builds it in a job of the
 * build job manager when a file is missing. Returns immediately, outside the job
 * manager, when all files exist.
 *
 * @param {string} root - Resolved DICOMweb root directory
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {Object} [options]
 * @param {FileDicomWebReader} [options.reader] - Reader instance
 * @param {Object} [options.context] - Job context of a running job; the build is then a nested job
 * @param {Object} [options.jobs] - Job manager (defaults to the shared build job manager)
 * @param {boolean} [options.background] - Never reject the job when the queue is full
 * @returns {Promise<{committed: boolean, payload?: Object}|undefined>} - Result of the first
 *   round of the build, or undefined when no build was necessary
 */
export async function ensureSeriesLevel(root, studyUID, seriesUID, options = {}) {
  const reader = options.reader ?? new FileDicomWebReader(root);
  const needsBuild = () => !seriesFilesExist(reader, studyUID, seriesUID);
  if (!needsBuild()) {
    return undefined;
  }
  return runJob(options, `series:${studyUID}/${seriesUID}`, needsBuild, async () => {
    console.verbose(`Processing series ${seriesUID}...`);
    const result = await seriesSummary(root, studyUID, seriesUID);
    console.noQuiet(`Completed series ${seriesUID}`);
    return result;
  });
}

/**
 * Ensures that the study level of one study exists: series/index.json and the study
 * index.json. Returns immediately, outside the job manager, when both files exist.
 * Otherwise, in one job of the build job manager:
 * 1. reads the generation of the study, before it reads any data;
 * 2. builds each series that has a missing file, as a nested job (ensureSeriesLevel),
 *    and uses the stored files of the other series;
 * 3. calls studyMain, which writes series/index.json and index.json, and commits them
 *    only when the generation did not change.
 *
 * @param {string} root - Resolved DICOMweb root directory
 * @param {string} studyUID - Study Instance UID
 * @param {Object} [options] - Same options as ensureSeriesLevel
 * @returns {Promise<{committed: boolean, payload?: Object}|undefined>} - Result of the first
 *   round of the build, or undefined when no build was necessary
 */
export async function ensureStudyLevel(root, studyUID, options = {}) {
  const reader = options.reader ?? new FileDicomWebReader(root);
  const needsBuild = () => !studyFilesExist(reader, studyUID);
  if (!needsBuild()) {
    return undefined;
  }
  return runJob(options, `study:${studyUID}`, needsBuild, async context => {
    const generation = generationTracker.current(studyUID);
    const seriesUIDs = await listDirectories(
      reader,
      reader.getStudyPath(studyUID, { path: 'series' })
    );
    for (const seriesUID of seriesUIDs) {
      await ensureSeriesLevel(root, studyUID, seriesUID, { reader, context });
    }
    return studyMain(studyUID, { dicomdir: root, generation });
  });
}

/**
 * Ensures that the studies list (studies/index.json) exists. When it is missing, one job
 * reads the generation of the studies list, ensures the study level of each study as a
 * nested job (ensureStudyLevel), and then builds the list from all study index files.
 *
 * @param {string} root - Resolved DICOMweb root directory
 * @param {Object} [options] - Same options as ensureSeriesLevel
 * @returns {Promise<{committed: boolean, payload?: string}|undefined>} - Result of the first
 *   round of the build, or undefined when no build was necessary
 */
export async function ensureStudiesLevel(root, options = {}) {
  const reader = options.reader ?? new FileDicomWebReader(root);
  const needsBuild = () => !reader.fileExists('studies', 'index.json');
  if (!needsBuild()) {
    return undefined;
  }
  return runJob(options, 'studies', needsBuild, async context => {
    const generation = generationTracker.current(null);
    for (const studyUID of await listDirectories(reader, 'studies')) {
      if (studyUID === 'temp') continue;
      await ensureStudyLevel(root, studyUID, { reader, context });
    }
    return indexSummary(root, [], { generation });
  });
}

/**
 * Sends the result of a build round that did not commit. The response file does not
 * exist in that case, so the data of the round (from memory) is the response.
 * @param {Object} res - Express response
 * @param {*} data - JSON value or JSON string
 */
export function sendBuildPayload(res, data) {
  res.status(200);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.send(typeof data === 'string' ? data : JSON.stringify(data));
}

/**
 * Handles an error of a build for a request: a QueueFullError gets
 * `503 Service Unavailable` with a `Retry-After` header, other errors go to next.
 * @returns {boolean|void}
 */
export function handleBuildError(err, res, next, label) {
  if (err instanceof QueueFullError || err?.name === 'QueueFullError') {
    console.warn(`${label}: ${err.message}`);
    res.setHeader('Retry-After', String(err.retryAfterSeconds ?? 10));
    res.status(503).send('Service Unavailable: too many builds in progress, retry later');
    return;
  }
  console.error(`${label}:`, err?.message || err);
  next(err);
}

/**
 * studyQueryController: for GET /studies. With StudyInstanceUID in the query, ensures
 * the study level of that study (ensureStudyLevel), and serves the study index.json.
 * Without it, ensures the studies list (ensureStudiesLevel), and serves studies/index.json.
 * When the build did not commit, sends the data of the first round. When the build
 * queue is full, answers 503 with Retry-After.
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
    const jobs = getBuildJobManager(params);

    try {
      if (studyUID) {
        if (createOnDemand && root) {
          const reader = new FileDicomWebReader(root);
          const result = await ensureStudyLevel(root, studyUID, { reader, jobs });
          const studyQuery = result?.payload?.studyQuery;
          if (studyQuery && !reader.studyFileExists(studyUID, 'index.json')) {
            return sendBuildPayload(res, [studyQuery]);
          }
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
      } else if (createOnDemand && root) {
        const reader = new FileDicomWebReader(root);
        const result = await ensureStudiesLevel(root, { reader, jobs });
        if (result?.payload && !reader.fileExists('studies', 'index.json')) {
          return sendBuildPayload(res, result.payload);
        }
      }
    } catch (err) {
      return handleBuildError(err, res, next, 'indexOnDemand: failed to create studies index');
    }
    studySingleMap(req, res, next);
  };
}
