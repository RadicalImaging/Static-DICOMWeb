import { handleHomeRelative, getStudyUIDPathAndSubPath } from '@radicalimaging/static-wado-util';
import {
  indexSummary,
  studyMain,
  seriesSummary,
  seriesFilesExist,
  studyFilesExist,
  createBuildReader,
  generationTracker,
  seriesGenerationKey,
} from '@radicalimaging/create-dicomweb';
import { studySingleMap, getDicomKey } from '../../adapters/requestAdapters.mjs';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import { indexingStaticController } from './staticControllers.mjs';

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
 * With `generationKey`, the caller joins only a round that started at the generation that it
 * read when it arrived, or later, so the response has the data stored before the request.
 * @param {Object} options - { context, jobs, background }
 */
function runJob(options, key, needsBuild, fn, generationKey) {
  const version = generationKey && (() => generationTracker.current(generationKey));
  if (options.context) {
    return options.context.child(key, needsBuild, fn, { version });
  }
  const jobs = options.jobs ?? getBuildJobManager();
  return jobs.run(key, needsBuild, fn, { background: options.background === true, version });
}

/**
 * Series generation key -> generation of a series build that committed, but found instance
 * directories with no readable metadata (`noneReadable`: corrupt or missing files). The series
 * is not built again until new data changes its generation, so broken data does not cost a
 * full read on each request. An I/O error fails the build instead, and records nothing, and
 * a series with no instance directories never starts a build (SQR-D3).
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
 * Returns true when the series level of a series needs a build: a series file is missing,
 * the series has instance directories, and no build of the current generation found only
 * unreadable data (seriesWithNoData). With a build reader, an I/O error throws.
 * @param {FileDicomWebReader} reader
 * @param {string} studyUID
 * @param {string} seriesUID
 * @returns {Promise<boolean>}
 */
export async function seriesNeedsBuild(reader, studyUID, seriesUID) {
  if (
    seriesFilesExist(reader, studyUID, seriesUID) ||
    hasNoData(seriesGenerationKey(studyUID, seriesUID))
  ) {
    return false;
  }
  const instancesPath = `${reader.getSeriesPath(studyUID, seriesUID)}/instances`;
  return (await reader.listDirectories(instancesPath)).length > 0;
}

/**
 * Ensures that the series level of one series exists, and builds it in a job of the
 * build job manager when it needs a build (seriesNeedsBuild). Returns immediately, outside
 * the job manager, when it does not.
 *
 * @param {string} root - Resolved DICOMweb root directory
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {Object} [options]
 * @param {FileDicomWebReader} [options.reader] - A build reader (createBuildReader, the default):
 *   with a lenient reader, an I/O error of a check counts as a missing file
 * @param {Object} [options.context] - Job context of a running job; the build is then a nested job
 * @param {Object} [options.jobs] - Job manager (defaults to the shared build job manager)
 * @param {boolean} [options.background] - Never reject the job when the queue is full
 * @returns {Promise<{committed: boolean, payload?: Object}|undefined>} - Result of the first
 *   round of the build, or undefined when no build was necessary
 */
export async function ensureSeriesLevel(root, studyUID, seriesUID, options = {}) {
  const reader = options.reader ?? createBuildReader(root);
  const generationKey = seriesGenerationKey(studyUID, seriesUID);
  const needsBuild = () => seriesNeedsBuild(reader, studyUID, seriesUID);
  if (!(await needsBuild())) {
    return undefined;
  }
  return runJob(
    options,
    `series:${studyUID}/${seriesUID}`,
    needsBuild,
    async () => {
      console.verbose(`Processing series ${seriesUID}...`);
      const generation = generationTracker.current(generationKey);
      const result = await seriesSummary(root, studyUID, seriesUID, { generation });
      if (result?.committed && result.payload?.noneReadable) {
        seriesWithNoData.set(generationKey, generation);
      }
      console.noQuiet(`Completed series ${seriesUID}`);
      return result;
    },
    generationKey
  );
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
  const reader = options.reader ?? createBuildReader(root);
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
  return runJob(
    options,
    `study:${studyUID}`,
    needsBuild,
    async context => {
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
    },
    studyUID
  );
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
 * A study whose build fails is left out (SQR-U4). After an I/O error of a study, the list
 * is not written, so the next request builds it again with that study. After any other
 * error, the list is written without that study, and a later build of the study adds it.
 *
 * @param {string} root - Resolved DICOMweb root directory
 * @param {Object} [options] - Same options as ensureSeriesLevel
 * @returns {Promise<{committed: boolean, payload: string}|undefined>} - undefined when the
 *   list exists; the payload is the JSON of the list
 */
export async function ensureStudiesLevel(root, options = {}) {
  const reader = options.reader ?? createBuildReader(root);
  const needsBuild = () => !reader.fileExists('studies', 'index.json');
  if (!needsBuild()) {
    return undefined;
  }
  return runJob(options, 'studies', needsBuild, async context => {
    const failed = new Set();
    let unavailable = false;
    for (const studyUID of await reader.listDirectories('studies')) {
      if (studyUID === 'temp') continue;
      try {
        // A study round that does not commit adds the study itself when a later round commits
        await ensureStudyLevel(root, studyUID, { reader, context, studyIndex: options.studyIndex });
      } catch (err) {
        console.warn(`ensureStudiesLevel: left out study ${studyUID}: ${err?.message || err}`);
        failed.add(studyUID);
        unavailable ||= err?.name === 'StorageUnavailableError';
      }
    }
    const payload = await serializeStudiesIndex(() =>
      indexSummary(root, [], { exclude: failed, write: !unavailable })
    );
    if (unavailable) {
      console.warn(
        `ensureStudiesLevel: studies/index.json not stored, each GET /studies scans all studies until these studies can be read: ${[...failed].join(', ')}`
      );
    }
    // No next round after an I/O error: the list is not stored, so the next request builds it
    return { committed: true, payload };
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

/** Root directory -> static handler of the stored derived files */
const staticHandlers = new Map();

/** Headers that the static handler sets for a stored file before it opens the file */
const STORED_FILE_HEADERS = [
  'Content-Encoding',
  'Content-Length',
  'Content-Type',
  'Last-Modified',
  'ETag',
  'Accept-Ranges',
];

/**
 * Serves the stored file of a request. `map` points req.url at the file, and the static
 * handler sends it. An upload can delete the file after the check of the caller (SQR-D5).
 * When the static handler then finds no file, `build` runs one time, and its data is the
 * response, so the request does not get 404 for stored data. With no data, or with no
 * `build`, the request goes to the next handler.
 *
 * The file can also go between the stat and the open. serve-static then calls `next(err)`
 * with a 404 error, and has already set the headers of the stored file (for example
 * `Content-Encoding: gzip`). Such an error counts as a missing file, and the build response
 * removes those headers first.
 * @param {string} root - Resolved DICOMweb root directory
 * @param {Function} map - Request adapter, for example seriesSingleMap
 * @param {(() => Promise<*>)|false} build - Returns the data of a build, or undefined
 * @param {string} label - Label of the log message of a failed build
 */
export function serveStored(root, map, req, res, next, build, label) {
  if (!staticHandlers.has(root)) {
    staticHandlers.set(root, indexingStaticController(root));
  }
  map(req, res, () =>
    staticHandlers.get(root)(req, res, async err => {
      const missing =
        !err ||
        (!res.headersSent && (err.code === 'ENOENT' || (err.statusCode ?? err.status) === 404));
      if (!missing || !build) {
        return next(err);
      }
      if (err) {
        for (const header of STORED_FILE_HEADERS) res.removeHeader(header);
      }
      try {
        const data = await build();
        return data?.length ? sendBuildPayload(res, data) : next();
      } catch (buildErr) {
        return handleBuildError(buildErr, res, next, label);
      }
    })
  );
}

/** Error names that a request answers with 503, and the reason of the response */
const UNAVAILABLE_REASONS = {
  QueueFullError: 'too many builds in progress',
  StorageUnavailableError: 'the storage cannot be read',
};

/**
 * Handles an error of a build for a request. A QueueFullError (SQR-D14) and a
 * StorageUnavailableError (an I/O error of the storage, SQR-U3) get
 * `503 Service Unavailable` with a `Retry-After` header. Other errors go to next.
 * @returns {boolean|void}
 */
export function handleBuildError(err, res, next, label) {
  const reason = UNAVAILABLE_REASONS[err?.name];
  if (reason) {
    console.warn(`${label}: ${err.message}`);
    res.setHeader('Retry-After', String(err.retryAfterSeconds ?? 10));
    res.status(503).send(`Service Unavailable: ${reason}, retry later`);
    return;
  }
  console.error(`${label}:`, err?.message || err);
  next(err);
}

/**
 * studyQueryController: for GET /studies. With StudyInstanceUID in the query, ensures
 * the study level of that study (ensureStudyLevel), and serves the study index.json.
 * Without it, ensures the studies list (ensureStudiesLevel), and serves studies/index.json.
 * When a study build did not commit, sends the data of the first round. When the build queue
 * is full, or the storage cannot be read, answers 503 with Retry-After (handleBuildError).
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
    const label = 'indexOnDemand: failed to create studies index';
    const buildStudy = async () => {
      const result = await ensureStudyLevel(root, studyUID, {
        jobs,
        studyIndex: params.studyIndex,
      });
      return result?.payload?.studyQuery && [result.payload.studyQuery];
    };

    try {
      if (studyUID) {
        if (createOnDemand && root) {
          // Each caller of a build sends its data, also when an upload deleted the file since
          const data = await buildStudy();
          if (data) {
            return sendBuildPayload(res, data);
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
      } else if (createOnDemand && root && !hashStudyUidPath) {
        // The builds use paths with no hash (Q3): they would list the hash directories
        const result = await ensureStudiesLevel(root, { jobs, studyIndex: params.studyIndex });
        if (result?.payload) {
          return sendBuildPayload(res, result.payload);
        }
      }
    } catch (err) {
      return handleBuildError(err, res, next, label);
    }
    if (!root) {
      return studySingleMap(req, res, next);
    }
    const build = studyUID && createOnDemand && !hashStudyUidPath && buildStudy;
    serveStored(root, studySingleMap, req, res, next, build, label);
  };
}
