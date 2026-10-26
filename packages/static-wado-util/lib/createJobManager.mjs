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
 *    that queued job.
 * 4. When `fn()` returns `{ committed: false }`, the callers get the result of that
 *    round, and the job manager starts the next round as a background job after a delay.
 *    The delay starts at `roundDelayMs`, doubles after each round that does not commit,
 *    stops at `maxRoundDelayMs`, and starts again at `roundDelayMs` after a commit.
 * 5. At most `maxRunning` top-level jobs run at the same time; the others wait in a
 *    first-in, first-out queue. The wait of rule 3 holds no slot.
 * 6. A nested job runs at once, in the slot of its top-level job, and is never limited.
 *    A job awaits each `child` call before the next one.
 * 7. A queued job blocks nothing: `child` for its key runs at once, and when the queued
 *    job starts later, rule 1 finds the file.
 * 8. When the queue holds `maxQueued` request jobs, `run` rejects a new request job with
 *    QueueFullError. A background job is never rejected, and does not count to the limit.
 *
 * A running job waits only for jobs at lower levels, and a nested job never waits for a
 * slot, so the waits cannot form a loop and each started job completes.
 *
 * @param {Object} [options]
 * @param {number} [options.maxRunning=2] - Maximum number of top-level jobs that run at the same time
 * @param {number} [options.maxQueued=20] - Maximum number of request (not background) jobs in the queue
 * @param {number} [options.retryAfterSeconds=10] - Value for the Retry-After header of a QueueFullError
 * @param {number} [options.roundDelayMs=1000] - Delay before the first next round
 * @param {number} [options.maxRoundDelayMs=30000] - Maximum delay before a next round
 * @returns {{run: Function, whenIdle: () => Promise<void>, stats: () => Object}}
 */
export function createJobManager(options = {}) {
  const maxRunning = Math.max(1, options.maxRunning ?? 2);
  const maxQueued = Math.max(0, options.maxQueued ?? 20);
  const retryAfterSeconds = options.retryAfterSeconds ?? 10;
  const roundDelayMs = options.roundDelayMs ?? 1000;
  const maxRoundDelayMs = options.maxRoundDelayMs ?? 30000;

  /** key -> promise of the first-round result of the running job */
  const running = new Map();
  /** key -> promise of the result of a queued top-level job */
  const queuedByKey = new Map();
  /** FIFO queue of top-level jobs that wait for a slot */
  const queue = [];
  /** key -> number of rounds that did not commit */
  const rounds = new Map();
  let active = 0;
  /** Number of request (not background) jobs in the queue */
  let queuedRequests = 0;
  /** Number of next rounds that wait for their delay */
  let delayedRounds = 0;
  let idleWaiters = [];

  function checkIdle() {
    if (active === 0 && queue.length === 0 && running.size === 0 && delayedRounds === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach(resolve => resolve());
    }
  }

  function nextRound(key, needsBuild, fn) {
    const count = (rounds.get(key) ?? 0) + 1;
    rounds.set(key, count);
    if (count % WARN_ROUNDS === 0) {
      console.warn(`[jobManager] ${key}: ${count} rounds did not commit, the data still changes`);
    }
    const delay = Math.min(roundDelayMs * 2 ** (count - 1), maxRoundDelayMs);
    delayedRounds++;
    // unref: a pending next round does not keep the process alive
    setTimeout(() => {
      delayedRounds--;
      run(key, needsBuild, fn, { background: true }).catch(err =>
        console.warn(`[jobManager] ${key}: next round failed:`, err?.message || err)
      );
      checkIdle();
    }, delay).unref?.();
  }

  /** Starts a job (rule 1, 2 and 4); the caller checked that no job runs for the key */
  function startJob(key, needsBuild, fn) {
    const context = { key, child };
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
        if (result?.committed === false) {
          nextRound(key, needsBuild, fn);
        } else {
          rounds.delete(key);
        }
        checkIdle();
      },
      () => {
        running.delete(key);
        rounds.delete(key);
        checkIdle();
      }
    );
    return promise;
  }

  function releaseSlot() {
    active--;
    while (active < maxRunning && queue.length > 0) {
      active++;
      queue.shift()();
    }
    checkIdle();
  }

  /** Runs a top-level job in a slot that the caller acquired */
  async function runInSlot(key, needsBuild, fn) {
    const existing = running.get(key);
    if (existing) {
      releaseSlot();
      return existing;
    }
    try {
      return await startJob(key, needsBuild, fn);
    } finally {
      releaseSlot();
    }
  }

  /**
   * Runs a nested job inside the job of the caller (rule 6). Not limited by the slots.
   * @param {string} key - Level and UIDs, for example `series:<studyUID>/<seriesUID>`
   * @param {() => boolean|Promise<boolean>} needsBuild
   * @param {(context: Object) => Promise<{committed: boolean}>} fn
   */
  function child(key, needsBuild, fn) {
    const existing = running.get(key);
    if (existing) {
      return existing;
    }
    return startJob(key, needsBuild, fn);
  }

  /**
   * Runs a top-level job.
   * @param {string} key - Level and UIDs, for example `study:<studyUID>`
   * @param {() => boolean|Promise<boolean>} needsBuild - True when the files of the job are missing
   * @param {(context: Object) => Promise<{committed: boolean}>} fn - One round of the build
   * @param {Object} [runOptions]
   * @param {boolean} [runOptions.background=false] - Never reject the job when the queue is full
   * @returns {Promise<*>} - Result of the first round, or undefined when no build was necessary
   */
  async function run(key, needsBuild, fn, runOptions = {}) {
    const existing = running.get(key) ?? queuedByKey.get(key);
    if (existing) {
      return existing;
    }
    if (active < maxRunning) {
      active++;
      return runInSlot(key, needsBuild, fn);
    }
    const background = runOptions.background === true;
    if (!background && queuedRequests >= maxQueued) {
      throw new QueueFullError(key, retryAfterSeconds);
    }
    if (!background) {
      queuedRequests++;
    }
    const queued = new Promise((resolve, reject) => {
      queue.push(() => {
        queuedByKey.delete(key);
        if (!background) {
          queuedRequests--;
        }
        runInSlot(key, needsBuild, fn).then(resolve, reject);
      });
    });
    queuedByKey.set(key, queued);
    return queued;
  }

  /** Resolves when no job runs and the queue is empty, also after the next rounds */
  function whenIdle() {
    return new Promise(resolve => {
      idleWaiters.push(resolve);
      checkIdle();
    });
  }

  function stats() {
    return { active, queued: queue.length, queuedRequests, running: running.size, delayedRounds };
  }

  return { run, whenIdle, stats };
}
