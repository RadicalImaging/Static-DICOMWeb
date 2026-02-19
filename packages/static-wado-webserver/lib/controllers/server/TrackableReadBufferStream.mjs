import { data } from 'dcmjs';
import { recordLivelock } from '../../util/livelockRegistry.mjs';

const { ReadBufferStream } = data;

/** Default: no livelock detection. Set to e.g. 15000 to log after 15s waiting. */
const DEFAULT_LIVELOCK_DETECT_MS = 0;

/**
 * ReadBufferStream subclass that tracks pending ensureAvailable calls and
 * exposes current stream size for use in multipartStream (e.g. back-pressure).
 *
 * Tracking is implemented here so dcmjs BufferStream.js is not modified.
 *
 * - currentStreamSize: bytes written to the stream so far (same as .size).
 * - pendingEnsureAvailableDesiredBytes: byte counts that readers are currently
 *   awaiting (from ensureAvailable()).
 * - maxPendingEnsureAvailableBytes: max of the above; bytes beyond the current
 *   offset that are being awaited by any pending ensureAvailable.
 *
 * Optional livelock detection: set options.livelockDetectMs (or env
 * TRACKABLE_STREAM_LIVELOCK_DETECT_MS) to a positive number. If an
 * ensureAvailable() promise is still pending after that many ms, a warning
 * is logged with the stack trace captured at the time of the call (to help
 * find where the reader is stuck).
 *
 * Backpressure options (for shouldPause / waitForBackPressure):
 * - backpressureMaxBytes: max bytes beyond offset before pausing (default 512kb).
 * - streamWritePromiseTracker: { getUnsettledCount(), limitUnsettled(max, timeoutMs) }.
 * - streamWriteLimit: max unsettled stream writes before pausing.
 * - backpressureWaitMs: time to wait when size is too big (ms).
 * - backPressureTimeoutMs: timeout for limitUnsettled (ms).
 */
export class TrackableReadBufferStream extends ReadBufferStream {
  constructor(buffer, littleEndian, options = {}) {
    super(buffer, littleEndian, options);
    /** @type {{ bytes: number }[]} */
    this._pendingEnsureAvailableEntries = [];
    const envMs = parseInt(
      typeof process !== 'undefined' && process.env.TRACKABLE_STREAM_LIVELOCK_DETECT_MS,
      10
    );
    this._livelockDetectMs =
      options.livelockDetectMs ?? (Number.isFinite(envMs) ? envMs : DEFAULT_LIVELOCK_DETECT_MS);

    this._backpressureMaxBytes = options.backpressureMaxBytes ?? 128 * 1024;
    this._streamWritePromiseTracker = options.streamWritePromiseTracker ?? null;
    this._streamWriteLimit = options.streamWriteLimit ?? 25;
    this._backpressureWaitMs = options.backpressureWaitMs ?? 1000;
    this._backPressureTimeoutMs = options.backPressureTimeoutMs ?? 5000;
    /** Set when the request is aborted (e.g. timeout, client disconnect). instanceFromStream uses this to throw/return as aborted. */
    this._abortedReason = null;
    /** Promise rejected when setAborted() is called; used so ensureAvailable() rejects instead of resolving when request is killed. */
    this._abortPromise = new Promise((_, rej) => {
      this._abortReject = rej;
    });

    // Log tracker ID for debugging
    if (this._streamWritePromiseTracker) {
      console.verbose(
        `[TrackableReadBufferStream] created with tracker ${this._streamWritePromiseTracker.getTrackerId()}`
      );
    }
  }

  /**
   * Mark the stream as aborted (e.g. STOW request timeout or client disconnect).
   * Sets abortedReason and marks the stream complete so readers can finish and treat the result as aborted.
   * @param {Error} [err] - Reason for abort
   */
  setAborted(err) {
    this._abortedReason = err ?? new Error('Request aborted');
    if (this._abortReject) {
      this._abortReject(this._abortedReason);
      this._abortReject = null;
    }
    this.setComplete();
  }

  /**
   * If set, the request was aborted; instanceFromStream should throw/return with aborted semantics.
   * @returns {Error|null}
   */
  get abortedReason() {
    return this._abortedReason ?? null;
  }

  /**
   * Returns true if the read-from-stream / write-to-buffer path should pause.
   * True when bytes beyond offset exceeds the size threshold (max of backpressureMaxBytes
   * and maxPendingEnsureAvailableBytes), or when stream write promise count exceeds streamWriteLimit.
   * @returns {boolean}
   */
  shouldPause() {
    const bytesBeyondOffset = this.currentStreamSize - this.offset;
    const sizeThreshold = Math.max(this._backpressureMaxBytes, this.maxPendingEnsureAvailableBytes);
    const tracker = this._streamWritePromiseTracker;
    if (bytesBeyondOffset > sizeThreshold) {
      console.verbose(
        '[TrackableReadBufferStream] shouldPause',
        bytesBeyondOffset - sizeThreshold,
        Math.floor(this.offset / 1024),
        'kb, tracker:',
        tracker?.getTrackerId(),
        'writes:',
        tracker?.getUnsettledCount(),
        tracker?.getSettledCount()
      );
      return true;
    }
    if (tracker && this._streamWriteLimit) {
      const unsettled = tracker.getUnsettledCount();
      if (unsettled > this._streamWriteLimit) {
        const settled = tracker.getSettledCount();
        console.verbose(
          `[TrackableReadBufferStream] shouldPause: true (streamWrite unsettled=${unsettled} > limit=${this._streamWriteLimit}, settled=${settled})`
        );
        return true;
      }
    }
    return false;
  }

  /**
   * Waits for backpressure to ease: if size is too big, waits configured time
   * or until stream write count drops (whichever first); if stream writes are
   * too many, waits until limitUnsettled. If both conditions held, waits the
   * configured time then waits for limitUnsettled.
   * @returns {Promise<void>}
   */
  async waitForBackPressure() {
    const bytesBeyondOffset = this.currentStreamSize - this.offset;
    const sizeThreshold = Math.max(this._backpressureMaxBytes, this.maxPendingEnsureAvailableBytes);
    const sizeTooBig = bytesBeyondOffset > sizeThreshold;
    const tracker = this._streamWritePromiseTracker;
    const limit = this._streamWriteLimit;

    const waitMs = this._backpressureWaitMs;
    const timeoutMs = this._backPressureTimeoutMs;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    if (tracker?.getUnsettledCount() > limit) {
      console.verbose(
        '[TrackableReadBufferStream] waitForBackPressure: tracker',
        tracker.getTrackerId(),
        'unsettled',
        tracker.getUnsettledCount(),
        'settled',
        tracker.getSettledCount(),
        'limit',
        limit,
        'timeoutMs',
        waitMs * 10
      );
      await tracker.limitUnsettled(limit, waitMs * 10);
      return;
    }
    if (sizeTooBig) {
      console.verbose('[TrackableReadBufferStream] waitForBackPressure: sizeTooBig');
      await sleep(waitMs);
    }
  }

  /**
   * Override to track desired bytes for each pending ensureAvailable call.
   * Optionally logs a livelock warning with stack if the wait exceeds livelockDetectMs.
   * @param {number} [bytes=1024]
   * @returns {boolean | Promise<boolean>}
   */
  ensureAvailable(bytes = 1024) {
    if (this._abortedReason) {
      return Promise.reject(this._abortedReason);
    }
    if (this.isAvailable(bytes)) return true;
    const entry = { bytes };
    this._pendingEnsureAvailableEntries.push(entry);
    let stackCapture = null;
    if (this._livelockDetectMs > 0) {
      const err = new Error('[TrackableReadBufferStream ensureAvailable]');
      stackCapture = err.stack || String(err);
    }
    const result = super.ensureAvailable(bytes);
    if (result && typeof result.then === 'function') {
      const raced = Promise.race([result, this._abortPromise]);
      const removeEntry = () => {
        const i = this._pendingEnsureAvailableEntries.indexOf(entry);
        if (i !== -1) this._pendingEnsureAvailableEntries.splice(i, 1);
      };
      const livelockMs = this._livelockDetectMs;
      if (livelockMs > 0 && stackCapture) {
        const timer = setTimeout(() => {
          const idx = this._pendingEnsureAvailableEntries.indexOf(entry);
          if (idx !== -1) {
            console.warn(
              `[TrackableReadBufferStream] Possible livelock: ensureAvailable(${bytes}) still pending after ${livelockMs}ms. Stream: offset=${this.offset} endOffset=${this.endOffset} isComplete=${this.isComplete}. Call stack at ensureAvailable:`
            );
            process.stderr.write(stackCapture + '\n');
            recordLivelock({
              bytes,
              offset: this.offset,
              endOffset: this.endOffset,
              isComplete: this.isComplete,
              livelockDetectMs: livelockMs,
              stack: stackCapture,
            });
          }
        }, livelockMs);
        return raced.then(
          r => {
            clearTimeout(timer);
            removeEntry();
            return r;
          },
          e => {
            clearTimeout(timer);
            removeEntry();
            throw e;
          }
        );
      }
      return raced.then(
        r => {
          removeEntry();
          return r;
        },
        e => {
          removeEntry();
          throw e;
        }
      );
    }
    const i = this._pendingEnsureAvailableEntries.indexOf(entry);
    if (i !== -1) this._pendingEnsureAvailableEntries.splice(i, 1);
    return result;
  }

  /**
   * Current total bytes in the stream (updated as addBuffer is called).
   * @returns {number}
   */
  get currentStreamSize() {
    return this.size;
  }

  /**
   * Byte counts that readers are currently awaiting (from ensureAvailable()).
   * @returns {number[]}
   */
  get pendingEnsureAvailableDesiredBytes() {
    return this._pendingEnsureAvailableEntries.map(e => e.bytes);
  }

  /**
   * Number of bytes beyond the current offset that are being awaited by
   * pending ensureAvailable call(s). Equal to the maximum of
   * pendingEnsureAvailableDesiredBytes, or 0 if none are pending.
   * @returns {number}
   */
  get maxPendingEnsureAvailableBytes() {
    const desired = this.pendingEnsureAvailableDesiredBytes;
    return desired.length ? Math.max(...desired) : 0;
  }
}
