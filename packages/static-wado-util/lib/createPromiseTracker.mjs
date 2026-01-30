/**
 * Tracks a list of promises and counts how many have settled.
 * Provides back pressure via limitUnsettled for flow control.
 *
 * @example
 * const tracker = createPromiseTracker();
 * tracker.add(someAsyncOperation());
 * await tracker.limitUnsettled(10, 30000); // Wait until <10 unsettled or 30s
 */
export function createPromiseTracker() {
  const promises = new Set();
  const settleCallbacks = new Set();

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
    // Attach .catch() to the promise from .finally() so that when the tracked
    // promise rejects, we don't get an unhandled rejection (e.g. invalid DICOM).
    p.finally(() => {
      promises.delete(p);
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
    return new Promise((resolve) => {
      let timeoutId;
      const cleanup = () => {
        settleCallbacks.delete(onSettle);
        clearTimeout(timeoutId);
      };

      const check = () => {
        const count = promises.size;
        if (count < maxUnsettled) {
          cleanup();
          resolve(count);
          return true;
        }
        return false;
      };

      const onSettle = () => {
        check();
      };

      if (check()) return;

      settleCallbacks.add(onSettle);
      timeoutId = setTimeout(() => {
        cleanup();
        resolve(promises.size);
      }, timeoutMs);
    });
  }

  return { add, limitUnsettled, getUnsettledCount };
}
