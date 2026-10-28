/** Rounds of one key after which the job manager logs a warning (and continues) */
const WARN_ROUNDS = 10;

/**
 * Error of `run` when the queue of top-level jobs is full. A server answers it with
 * `503 Service Unavailable` and a `Retry-After` header of `retryAfterSeconds`.
 */
export class QueueFullError extends Error {
  constructor(key, retryAfterSeconds) {
    super(`Too many build jobs in the queue, job ${key} is not started`);
    this.name = 'QueueFullError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Creates a job manager for builds that can start nested builds at lower levels, for
 * example a study build that builds the series that have a missing file.
 *
 * - `run(key, needsBuild, fn, { background })` runs a top-level job.
 * - `context.child(key, needsBuild, fn)` runs a nested job inside the job of the caller.
 *
 * `needsBuild()` returns true when the files of the job are missing. `fn(context)` does
 * one round of the build, and returns `{ committed }`. The rules:
 *
 * 1. Each job calls `needsBuild()` when it starts, and returns undefined when it is false.
 * 2. One running job for each key, top-level or nested. A queued job is not running.
 * 3. A call that finds a running job for its key waits for the first round of that job,
 *    and gets its result, or its error when that job failed. A call never takes over the
 *    job of a different caller. A top-level call for a key that is in the queue joins
 *    that queued job. With a `version` option (a value that only increases, for example
 *    the generation of the data), a call joins only a round that started at the version
 *    that the call read when it arrived, or later. For an older round, the call waits until
 *    that round ends, and then joins or starts a round. That round starts after the call
 *    arrived, so a call waits for at most one older round.
 * 4. When `fn()` returns `{ committed: false }`, the callers get the result of that
 *    round, and the job manager starts the next round as a background job after a delay.
 *    The delay starts at `roundDelayMs`, doubles after each round that does not commit,
 *    stops at `maxRoundDelayMs`, and starts again at `roundDelayMs` after a commit. A key
 *    has at most one next round that waits for its delay.
 * 5. At most `maxRunning` top-level jobs run at the same time, and `requestSlots` more
 *    request jobs. The others wait in two first-in, first-out queues: a request job starts
 *    before each background job, except that a waiting background job starts after
 *    `backgroundEvery` request jobs started from the queue, so that it never waits forever.
 *    A request call that joins a queued background job moves that job to the request
 *    queue. The wait of rule 3 holds no slot.
 * 6. A nested job runs at once, in the slot of its top-level job, and is never limited.
 *    A job awaits each `child` call before the next one.
 * 7. A queued job blocks nothing: `child` for its key runs at once, and when the queued
 *    job starts later, rule 1 finds the file.
 * 8. When the queue holds `maxQueued` request jobs, `run` rejects a new request job with
 *    QueueFullError, also when that request joins a queued background job. A background job
 *    is never rejected, and does not count to the limit.
 *
 * A running job waits only for jobs at lower levels, and a nested job never waits for a
 * slot, so the waits cannot form a loop and each started job completes.
 *
 * @param {Object} [options]
 * @param {number} [options.maxRunning=2] - Maximum number of top-level jobs that run at the same time
 * @param {number} [options.maxQueued=20] - Maximum number of request (not background) jobs in the queue
 * @param {number} [options.requestSlots=0] - Running slots for request jobs only, above `maxRunning`
 * @param {number} [options.backgroundEvery=8] - Queued request jobs that start before a waiting background job
 * @param {number} [options.retryAfterSeconds=10] - Value for the Retry-After header of a QueueFullError
 * @param {number} [options.roundDelayMs=1000] - Delay before the first next round
 * @param {number} [options.maxRoundDelayMs=30000] - Maximum delay before a next round
 * @returns {{run: Function, whenIdle: () => Promise<void>, stats: () => Object}}
 */
export function createJobManager(options = {}) {
  const maxRunning = Math.max(1, options.maxRunning ?? 2);
  const maxQueued = Math.max(0, options.maxQueued ?? 20);
  const maxRequestRunning = maxRunning + Math.max(0, options.requestSlots ?? 0);
  const backgroundEvery = Math.max(1, options.backgroundEvery ?? 8);
  const retryAfterSeconds = options.retryAfterSeconds ?? 10;
  const roundDelayMs = options.roundDelayMs ?? 1000;
  const maxRoundDelayMs = options.maxRoundDelayMs ?? 30000;

  /** key -> promise of the first-round result of the running job */
  const running = new Map();
  /** key -> version that the running job read when it started (rule 3) */
  const startVersions = new Map();
  /** key -> queued top-level job: { promise, background, start } */
  const queuedByKey = new Map();
  /** FIFO queues of the top-level jobs that wait for a slot */
  const requestQueue = [];
  const backgroundQueue = [];
  /** key -> number of rounds that did not commit */
  const rounds = new Map();
  let active = 0;
  /** Request jobs that started from the queue while a background job waited (rule 5) */
  let requestsBeforeBackground = 0;
  /** Number of request (not background) jobs in the queue */
  let queuedRequests = 0;
  /** Keys whose next round waits for its delay: one pending next round for each key */
  const delayedKeys = new Set();
  let idleWaiters = [];

  function checkIdle() {
    const queued = requestQueue.length + backgroundQueue.length;
    if (active === 0 && queued === 0 && running.size === 0 && delayedKeys.size === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach(resolve => resolve());
    }
  }

  /** True when a call that arrived at version `arrival` can join the running job of `key` */
  function joinable(key, arrival) {
    const started = startVersions.get(key);
    return arrival === undefined || started === undefined || started >= arrival;
  }

  /**
   * Returns the running job of `key` when a call that arrived at `arrival` cannot join it
   * (rule 3). The call waits until it ends, and then looks again.
   * @returns {Promise|undefined}
   */
  function olderRound(key, arrival) {
    const existing = running.get(key);
    return existing && !joinable(key, arrival) ? existing.catch(() => {}) : undefined;
  }

  function nextRound(key, needsBuild, fn, version) {
    // A round of a request between two rounds does not start a second chain of rounds
    if (delayedKeys.has(key)) {
      return;
    }
    const count = (rounds.get(key) ?? 0) + 1;
    rounds.set(key, count);
    if (count % WARN_ROUNDS === 0) {
      console.warn(`[jobManager] ${key}: ${count} rounds did not commit, the data still changes`);
    }
    const delay = Math.min(roundDelayMs * 2 ** (count - 1), maxRoundDelayMs);
    delayedKeys.add(key);
    // unref: a pending next round does not keep the process alive
    setTimeout(() => {
      delayedKeys.delete(key);
      run(key, needsBuild, fn, { background: true, version }).catch(err =>
        console.warn(`[jobManager] ${key}: next round failed:`, err?.message || err)
      );
      checkIdle();
    }, delay).unref?.();
  }

  /** Starts a job (rule 1, 2 and 4); the caller checked that no job runs for the key */
  function startJob(key, needsBuild, fn, version) {
    const context = { key, child };
    startVersions.set(key, version?.());
    const promise = (async () => {
      if (!(await needsBuild())) {
        return undefined;
      }
      return fn(context);
    })();
    running.set(key, promise);
    // Registered first, so the bookkeeping runs before the callers continue
    promise.then(
      result => {
        running.delete(key);
        startVersions.delete(key);
        if (result?.committed === false) {
          nextRound(key, needsBuild, fn, version);
        } else {
          rounds.delete(key);
        }
        checkIdle();
      },
      () => {
        running.delete(key);
        startVersions.delete(key);
        rounds.delete(key);
        checkIdle();
      }
    );
    return promise;
  }

  function startBackground() {
    active++;
    requestsBeforeBackground = 0;
    backgroundQueue.shift().start();
  }

  function releaseSlot() {
    active--;
    if (
      backgroundQueue.length > 0 &&
      requestsBeforeBackground >= backgroundEvery &&
      active < maxRunning
    ) {
      startBackground();
    }
    while (active < maxRequestRunning && requestQueue.length > 0) {
      active++;
      if (backgroundQueue.length > 0) requestsBeforeBackground++;
      requestQueue.shift().start();
    }
    while (active < maxRunning && backgroundQueue.length > 0) {
      startBackground();
    }
    checkIdle();
  }

  /** Moves a queued background job to the request queue, for a request call (rule 5) */
  function promote(entry, key) {
    if (!entry.background) {
      return;
    }
    if (queuedRequests >= maxQueued) {
      throw new QueueFullError(key, retryAfterSeconds);
    }
    backgroundQueue.splice(backgroundQueue.indexOf(entry), 1);
    entry.background = false;
    queuedRequests++;
    requestQueue.push(entry);
  }

  /** Runs a top-level job in a slot that the caller acquired */
  async function runInSlot(key, needsBuild, fn, version) {
    // A job that runs now started after each caller of this queued job arrived (rule 3)
    const existing = running.get(key);
    if (existing) {
      releaseSlot();
      return existing;
    }
    try {
      return await startJob(key, needsBuild, fn, version);
    } finally {
      releaseSlot();
    }
  }

  /**
   * Runs a nested job inside the job of the caller (rule 6). Not limited by the slots.
   * @param {string} key - Level and UIDs, for example `series:<studyUID>/<seriesUID>`
   * @param {() => boolean|Promise<boolean>} needsBuild
   * @param {(context: Object) => Promise<{committed: boolean}>} fn
   * @param {Object} [childOptions]
   * @param {() => number} [childOptions.version] - Version of the data of the key (rule 3)
   */
  function child(key, needsBuild, fn, childOptions = {}) {
    const arrival = childOptions.arrival ?? childOptions.version?.();
    const older = olderRound(key, arrival);
    if (older) {
      return older.then(() => child(key, needsBuild, fn, { ...childOptions, arrival }));
    }
    return running.get(key) ?? startJob(key, needsBuild, fn, childOptions.version);
  }

  /**
   * Runs a top-level job.
   * @param {string} key - Level and UIDs, for example `study:<studyUID>`
   * @param {() => boolean|Promise<boolean>} needsBuild - True when the files of the job are missing
   * @param {(context: Object) => Promise<{committed: boolean}>} fn - One round of the build
   * @param {Object} [runOptions]
   * @param {boolean} [runOptions.background=false] - Never reject the job when the queue is full
   * @param {() => number} [runOptions.version] - Version of the data of the key (rule 3)
   * @returns {Promise<*>} - Result of the first round, or undefined when no build was necessary
   */
  async function run(key, needsBuild, fn, runOptions = {}) {
    const { version } = runOptions;
    const arrival = runOptions.arrival ?? version?.();
    const older = olderRound(key, arrival);
    if (older) {
      await older;
      return run(key, needsBuild, fn, { ...runOptions, arrival });
    }
    const background = runOptions.background === true;
    const existing = running.get(key);
    if (existing) {
      return existing;
    }
    const queuedEntry = queuedByKey.get(key);
    if (queuedEntry) {
      if (!background) {
        promote(queuedEntry, key);
      }
      return queuedEntry.promise;
    }
    if (active < (background ? maxRunning : maxRequestRunning)) {
      active++;
      return runInSlot(key, needsBuild, fn, version);
    }
    if (!background && queuedRequests >= maxQueued) {
      throw new QueueFullError(key, retryAfterSeconds);
    }
    if (!background) {
      queuedRequests++;
    }
    const entry = { background };
    entry.promise = new Promise((resolve, reject) => {
      entry.start = () => {
        queuedByKey.delete(key);
        if (!entry.background) {
          queuedRequests--;
        }
        runInSlot(key, needsBuild, fn, version).then(resolve, reject);
      };
    });
    (background ? backgroundQueue : requestQueue).push(entry);
    queuedByKey.set(key, entry);
    return entry.promise;
  }

  /** Resolves when no job runs and the queue is empty, also after the next rounds */
  function whenIdle() {
    return new Promise(resolve => {
      idleWaiters.push(resolve);
      checkIdle();
    });
  }

  function stats() {
    return {
      active,
      queued: requestQueue.length + backgroundQueue.length,
      queuedRequests,
      running: running.size,
      delayedRounds: delayedKeys.size,
    };
  }

  return { run, whenIdle, stats };
}
