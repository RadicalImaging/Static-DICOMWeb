/** Default of the server param maxStalledStowListeners */
export const DEFAULT_MAX_STALLED_STOW_LISTENERS = 8;
/** Retry-After (seconds) of a STOW-RS request that the limit rejects */
const RETRY_AFTER_SECONDS = 60;

let counter = null;

/**
 * Creates the server-wide count of the STOW-RS listeners that did not settle within the wait
 * of their request (multipartStream). Such a listener still holds its writer, its buffers and
 * its file handles, usually because the storage is stuck. When the count reaches maxStalled,
 * the server answers each new STOW-RS request with 503 before it reads the body (SQR-D20).
 *
 * @param {Object} [options]
 * @param {number} [options.maxStalled=DEFAULT_MAX_STALLED_STOW_LISTENERS] - 0 turns the limit off
 * @param {number} [options.retryAfterSeconds=60]
 * @returns {{ isFull: () => boolean, retryAfterSeconds: number, add: (promises: Promise[]) => void, count: () => number }}
 */
export function createStalledStowListeners(options = {}) {
  const maxStalled = options.maxStalled ?? DEFAULT_MAX_STALLED_STOW_LISTENERS;
  let stalled = 0;
  return {
    isFull: () => maxStalled > 0 && stalled >= maxStalled,
    retryAfterSeconds: options.retryAfterSeconds ?? RETRY_AFTER_SECONDS,
    /**
     * Counts each promise as stalled until it settles. A promise that already settled is
     * removed again in a microtask, so before the next request arrives.
     */
    add(promises) {
      for (const promise of promises) {
        stalled += 1;
        const settle = () => {
          stalled -= 1;
        };
        Promise.resolve(promise).then(settle, settle);
      }
    },
    count: () => stalled,
  };
}

/**
 * Returns the stalled STOW-RS listener count of this server, created on the first call from
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
