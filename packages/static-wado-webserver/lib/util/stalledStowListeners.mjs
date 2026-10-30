import { createPromiseTracker, StatusMonitor } from '@radicalimaging/static-wado-util';

/** Default of the server param maxStalledStowListeners (the config refers to this value) */
export const DEFAULT_MAX_STALLED_STOW_LISTENERS = 8;
/** Retry-After (seconds) of a STOW-RS request that the limit rejects */
const RETRY_AFTER_SECONDS = 60;
/** StatusMonitor job type that shows the count while it is above 0 */
const STATUS_JOB_TYPE = 'stowStalled';

let counter = null;

/**
 * Creates the server-wide count of stalled STOW-RS work (SQR-D20). The count is a
 * createPromiseTracker, so each added promise counts once, until it settles. Two kinds of
 * promise go in:
 * - the listener promises of a request after the wait of the request (multipartStream), or
 *   when the request aborted. A listener that did not settle still holds its writer and its
 *   buffers;
 * - one promise for each failed instance whose writer destroyed file streams that did not
 *   close yet (instanceFromStream `onStuckWrites`). A destroyed file stream closes only after
 *   its pending file operation returns, so this promise follows the stuck I/O, also after the
 *   listener itself rejected.
 * The unit is one instance, so one request with maxStalled or more instances can reach the
 * limit. When the count reaches maxStalled, the server answers each new STOW-RS request with
 * 503 before it reads the body. While the count is above 0, StatusMonitor shows it as a job of
 * type `stowStalled`.
 *
 * @param {Object} [options]
 * @param {number} [options.maxStalled=DEFAULT_MAX_STALLED_STOW_LISTENERS] - 0 turns the limit off
 * @param {number} [options.retryAfterSeconds=60]
 * @returns {{ isFull: () => boolean, retryAfterSeconds: number, add: (promises: Promise[]) => void, count: () => number }}
 */
export function createStalledStowListeners(options = {}) {
  const maxStalled = options.maxStalled ?? DEFAULT_MAX_STALLED_STOW_LISTENERS;
  const tracker = createPromiseTracker('stalledStowListeners');
  let jobId = null;

  // Starts, updates or ends the status job after each change of the count
  const showCount = () => {
    const stalled = tracker.getUnsettledCount();
    if (stalled > 0 && jobId == null) {
      jobId = StatusMonitor.startJob(STATUS_JOB_TYPE, { stalled, maxStalled });
    } else if (stalled > 0) {
      StatusMonitor.updateJob(STATUS_JOB_TYPE, jobId, { stalled });
    } else if (jobId != null) {
      StatusMonitor.endJob(STATUS_JOB_TYPE, jobId, { stalled });
      jobId = null;
    }
  };

  return {
    isFull: () => maxStalled > 0 && tracker.getUnsettledCount() >= maxStalled,
    retryAfterSeconds: options.retryAfterSeconds ?? RETRY_AFTER_SECONDS,
    /**
     * Counts each promise until it settles. A promise that already settled leaves the count
     * in a microtask, so before the next request arrives.
     */
    add(promises) {
      for (const promise of promises) {
        tracker
          .add(promise)
          .catch(() => {})
          .finally(showCount);
      }
      showCount();
    },
    count: () => tracker.getUnsettledCount(),
  };
}

/**
 * Returns the stalled STOW-RS count of this server, created on the first call from
 * `params.maxStalledStowListeners`. `params.stalledStowListeners` replaces it (for tests).
 * @param {Object} [params] - Server params
 */
export function getStalledStowListeners(params = {}) {
  if (params.stalledStowListeners) {
    return params.stalledStowListeners;
  }
  if (!counter) {
    counter = createStalledStowListeners({ maxStalled: params.maxStalledStowListeners });
  }
  return counter;
}
