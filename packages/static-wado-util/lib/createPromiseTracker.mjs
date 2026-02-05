import { StatusMonitor } from './StatusMonitor.mjs';

/** Threshold above which we log a warning about pending promise count */
const PENDING_PROMISE_WARN_THRESHOLD = 500;
/** Log again every this many beyond the threshold */
const PENDING_PROMISE_WARN_STEP = 100;

/** Default interval (ms) for status monitor updates */
const DEFAULT_STATUS_MONITOR_INTERVAL_MS = 500;

/** Counter for assigning unique IDs to trackers */
let trackerIdCounter = 0;

/**
 * Tracks a list of promises and counts how many have settled.
 * Provides back pressure via limitUnsettled for flow control.
 *
 * @param {string} [name] - Optional name for this tracker (for debugging)
 * @example
 * const tracker = createPromiseTracker('fileTracker');
 * tracker.add(someAsyncOperation());
 * await tracker.limitUnsettled(10, 30000); // Wait until <10 unsettled or 30s
 */
export function createPromiseTracker(name) {
  const promises = new Set();
  const settleCallbacks = new Set();
  /** Total number of promises that have settled (fulfilled or rejected) since creation */
  let settledCount = 0;
  /** Next count at which to log (500, 600, 700, …); reset when count drops below threshold */
  let pendingNextLogAt = PENDING_PROMISE_WARN_THRESHOLD;
  /** Unique ID for this tracker instance (for debugging) */
  const trackerIdNum = ++trackerIdCounter;
  const trackerId = name ? `${name}#${trackerIdNum}` : `#${trackerIdNum}`;

  function notifySettle() {
    for (const cb of settleCallbacks) {
      cb();
    }
  }

  /**
   * Add a promise to track. The promise is removed from the unsettled count when it settles.
   *
   * @param {Promise} promise - The promise to track
   * @returns {Promise} - The same promise (for chaining)
   */
  function add(promise) {
    const p = Promise.resolve(promise);
    promises.add(p);
    if (promises.size >= pendingNextLogAt) {
      const excess = promises.size - PENDING_PROMISE_WARN_THRESHOLD;
      console.warn(
        `[createPromiseTracker ${trackerId}] pending promise count exceeded ${PENDING_PROMISE_WARN_THRESHOLD} by ${excess}: pending=${promises.size} settled=${settledCount}`
      );
      pendingNextLogAt =
        PENDING_PROMISE_WARN_THRESHOLD +
        PENDING_PROMISE_WARN_STEP * Math.floor(excess / PENDING_PROMISE_WARN_STEP) +
        PENDING_PROMISE_WARN_STEP;
    }
    // Attach .catch() to the promise from .finally() so that when the tracked
    // promise rejects, we don't get an unhandled rejection (e.g. invalid DICOM).
    p.finally(() => {
      promises.delete(p);
      settledCount += 1;
      if (promises.size < PENDING_PROMISE_WARN_THRESHOLD) {
        pendingNextLogAt = PENDING_PROMISE_WARN_THRESHOLD;
      }
      notifySettle();
    }).catch(() => {
      // Rejection is expected (e.g. invalid file); caller awaits the same promise
      // and handles the error. We only track settlement for back pressure.
    });
    return p;
  }

  /**
   * Returns the current count of unsettled (pending) promises.
   *
   * @returns {number}
   */
  function getUnsettledCount() {
    return promises.size;
  }

  /**
   * Returns the total count of promises that have settled (fulfilled or rejected) since creation.
   *
   * @returns {number}
   */
  function getSettledCount() {
    return settledCount;
  }

  /**
   * Returns a promise that resolves when either:
   * - The count of unsettled items drops below maxUnsettled, OR
   * - The given timeout in milliseconds is exceeded.
   *
   * Resolves to the number of unsettled items at the time of resolution.
   * Useful for back pressure: await this before accepting new work.
   *
   * @param {number} maxUnsettled - Maximum number of unsettled promises allowed before resolving
   * @param {number} timeoutMs - Maximum time to wait in milliseconds
   * @returns {Promise<number>} - Resolves to the unsettled count at resolution time
   */
  function limitUnsettled(maxUnsettled, timeoutMs = 10000) {
    return new Promise(resolve => {
      let timeoutId;
      const cleanup = () => {
        settleCallbacks.delete(onSettle);
        clearTimeout(timeoutId);
      };

      const onSettle = () => {
        const count = promises.size;
        if (count < maxUnsettled) {
          cleanup();
          resolve(count);
          return true;
        }
        return false;
      };

      if (onSettle()) return;

      settleCallbacks.add(onSettle);
      timeoutId = setTimeout(() => {
        cleanup();
        resolve(promises.size);
      }, timeoutMs);
    });
  }

  /**
   * Returns the unique ID of this tracker instance (for debugging).
   *
   * @returns {number}
   */
  function getTrackerId() {
    return trackerId;
  }

  /** Interval id when status monitor is running; null otherwise */
  let statusMonitorIntervalId = null;

  /**
   * Start periodically updating a StatusMonitor job with this tracker's settled/unsettled counts.
   * Stops automatically when getUnsettledCount() becomes 0 (job is done from this tracker's perspective).
   * Call stopStatusMonitor() to stop early (e.g. on abort).
   *
   * @param {string} typeId - Job type (e.g. 'stowInstances')
   * @param {string} jobId - Job id from StatusMonitor.startJob
   * @param {object} [options]
   * @param {number} [options.intervalMs=500] - How often to update
   * @param {(settled: number, unsettled: number) => object} [options.buildData] - Build job data from counts. If omitted, uses { [settledKey]: settled, [unsettledKey]: unsettled }.
   * @param {string} [options.settledKey='settled'] - Key for settled count when buildData is omitted
   * @param {string} [options.unsettledKey='unsettled'] - Key for unsettled count when buildData is omitted
   */
  function startStatusMonitor(typeId, jobId, options = {}) {
    if (statusMonitorIntervalId != null) {
      clearInterval(statusMonitorIntervalId);
      statusMonitorIntervalId = null;
    }
    const intervalMs = options.intervalMs ?? DEFAULT_STATUS_MONITOR_INTERVAL_MS;
    const buildData =
      options.buildData ??
      ((s, u) => ({
        [options.settledKey ?? 'settled']: s,
        [options.unsettledKey ?? 'unsettled']: u,
      }));

    function tick() {
      const settled = getSettledCount();
      const unsettled = getUnsettledCount();
      StatusMonitor.updateJob(typeId, jobId, buildData(settled, unsettled));
      if (unsettled === 0) {
        stopStatusMonitor();
      }
    }

    statusMonitorIntervalId = setInterval(tick, intervalMs);
    tick();
  }

  /**
   * Stop the status monitor interval (if running). No-op if not started or already stopped.
   */
  function stopStatusMonitor() {
    if (statusMonitorIntervalId != null) {
      clearInterval(statusMonitorIntervalId);
      statusMonitorIntervalId = null;
    }
  }

  return {
    add,
    limitUnsettled,
    getUnsettledCount,
    getSettledCount,
    getTrackerId,
    startStatusMonitor,
    stopStatusMonitor,
  };
}
