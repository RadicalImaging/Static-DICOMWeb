import {
  handleHomeRelative,
  getStudyUIDPathAndSubPath,
  QueueFullError,
} from '@radicalimaging/static-wado-util';
import {
  indexSummary,
  studyMain,
  seriesSummary,
  seriesFilesExist,
  studyFilesExist,
  FileDicomWebReader,
  generationTracker,
  seriesGenerationKey,
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
 * Series generation key -> generation of a series build that committed, but could store no
 * series file (no instance metadata is readable). The series is not built again until new
 * data changes its generation, so broken data does not cost a full read on each request.
 */
const seriesWithNoData = new Map();

function hasNoData(generationKey) {
  const generation = seriesWithNoData.get(generationKey);
  if (generation === undefined) {
    return false;
  }
  if (generation === generationTracker.current(generationKey)) {
    return true;
  }
  seriesWithNoData.delete(generationKey);
  return false;
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
  const generationKey = seriesGenerationKey(studyUID, seriesUID);
  const needsBuild = () =>
    !seriesFilesExist(reader, studyUID, seriesUID) && !hasNoData(generationKey);
  if (!needsBuild()) {
    return undefined;
  }
  return runJob(options, `series:${studyUID}/${seriesUID}`, needsBuild, async () => {
    console.verbose(`Processing series ${seriesUID}...`);
    const generation = generationTracker.current(generationKey);
    const result = await seriesSummary(root, studyUID, seriesUID, { generation });
    if (result?.committed && !seriesFilesExist(reader, studyUID, seriesUID)) {
      seriesWithNoData.set(generationKey, generation);
    }
    console.noQuiet(`Completed series ${seriesUID}`);
    return result;
  });
}

/**
 * Ensures that the study level of one study exists: series/index.json and the study
 * index.json. Returns immediately, outside the job manager, when both files exist.
 * Otherwise, in one job of the build job manager:
 * 1. reads the generation of the study, before it reads any data;
 * 2. calls studyMain, which builds each series that has a missing file as a nested job
 *    (ensureSeriesLevel), uses the stored files of the other series, and then writes
 *    series/index.json and index.json, and commits them only when the generation did not change;
 * 3. after a commit, adds the study to the studies list when the list does not have it
 *    (addStudyToStudiesIndex), unless `options.studyIndex` is false.
 *
 * @param {string} root - Resolved DICOMweb root directory
 * @param {string} studyUID - Study Instance UID
 * @param {Object} [options] - Same options as ensureSeriesLevel, and:
 * @param {boolean} [options.studyIndex] - False: do not update studies/index.json (params.studyIndex)
 * @returns {Promise<{committed: boolean, payload?: Object}|undefined>} - Result of the first
 *   round of the build, or undefined when no build was necessary
 */
export async function ensureStudyLevel(root, studyUID, options = {}) {
  const reader = options.reader ?? new FileDicomWebReader(root);
  const needsBuild = () => !studyFilesExist(reader, studyUID);
  if (!needsBuild()) {
    return undefined;
  }
  // A study with no stored series (for example an unknown UID) has nothing to build
  const seriesUIDs = await reader.listDirectories(
    reader.getStudyPath(studyUID, { path: 'series' })
  );
  if (!seriesUIDs.length) {
    return undefined;
  }
  return runJob(options, `study:${studyUID}`, needsBuild, async context => {
    const generation = generationTracker.current(studyUID);
    const result = await studyMain(studyUID, {
      dicomdir: root,
      generation,
      buildSeries: seriesUID => ensureSeriesLevel(root, studyUID, seriesUID, { reader, context }),
    });
    if (result?.committed && options.studyIndex !== false) {
      await addStudyToStudiesIndex(root, studyUID);
    }
    return result;
  });
}

/** In-process lock of studies/index.json: each update starts after the previous one */
let studiesIndexUpdates = Promise.resolve();

function serializeStudiesIndex(update) {
  const next = studiesIndexUpdates.then(update);
  studiesIndexUpdates = next.catch(() => {});
  return next;
}

/**
 * Adds a study to studies/index.json when the file exists and does not list the study.
 * Leaves the file alone when it lists the study, so the summary values of the entry can
 * be older than the study. The studies list is a best-effort helper: an error is only
 * logged, and the updates are serialized in this process only.
 * @param {string} root - Resolved DICOMweb root directory
 * @param {string} studyUID - Study Instance UID
 * @returns {Promise<void>}
 */
export function addStudyToStudiesIndex(root, studyUID) {
  return serializeStudiesIndex(() => indexSummary(root, [studyUID], { onlyMissing: true })).catch(
    err => console.warn(`addStudyToStudiesIndex(${studyUID}): ${err?.message || err}`)
  );
}

/**
 * Ensures that the studies list (studies/index.json) exists. When it is missing, one job
 * ensures the study level of each study as a nested job (ensureStudyLevel), and then
 * builds the list from all study index files. Best effort: the studies list has no
 * generation, and the write is serialized with addStudyToStudiesIndex in this process only.
 *
 * @param {string} root - Resolved DICOMweb root directory
 * @param {Object} [options] - Same options as ensureSeriesLevel
 * @returns {Promise<{committed: boolean}|undefined>} - undefined when the list exists
 */
export async function ensureStudiesLevel(root, options = {}) {
  const reader = options.reader ?? new FileDicomWebReader(root);
  const needsBuild = () => !reader.fileExists('studies', 'index.json');
  if (!needsBuild()) {
    return undefined;
  }
  return runJob(options, 'studies', needsBuild, async context => {
    for (const studyUID of await reader.listDirectories('studies')) {
      if (studyUID === 'temp') continue;
      await ensureStudyLevel(root, studyUID, { reader, context, studyIndex: false });
    }
    await serializeStudiesIndex(() => indexSummary(root, []));
    return { committed: true };
  });
}

/**
 * Returns the series metadata of a series build result: the metadata of the build, or the
 * kept series metadata when no instance metadata was readable.
 * @param {{payload?: Object}|undefined} result - Result of ensureSeriesLevel
 * @returns {Object[]|undefined}
 */
export function seriesMetadataOf(result) {
  const payload = result?.payload;
  return payload?.noneReadable ? payload.keptSeriesMetadata : payload?.instanceMetadataArray;
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
 * When a study build did not commit, sends the data of the first round. When the build
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
          const result = await ensureStudyLevel(root, studyUID, {
            reader,
            jobs,
            studyIndex: params.studyIndex,
          });
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
        await ensureStudiesLevel(root, { jobs });
      }
    } catch (err) {
      return handleBuildError(err, res, next, 'indexOnDemand: failed to create studies index');
    }
    studySingleMap(req, res, next);
  };
}
