import { data } from "dcmjs";

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
 */
export class TrackableReadBufferStream extends ReadBufferStream {
  constructor(buffer, littleEndian, options = {}) {
    super(buffer, littleEndian, options);
    /** @type {{ bytes: number }[]} */
    this._pendingEnsureAvailableEntries = [];
    const envMs = parseInt(
      typeof process !== "undefined" && process.env.TRACKABLE_STREAM_LIVELOCK_DETECT_MS,
      10
    );
    this._livelockDetectMs =
      options.livelockDetectMs ?? (Number.isFinite(envMs) ? envMs : DEFAULT_LIVELOCK_DETECT_MS);
  }

  /**
   * Override to track desired bytes for each pending ensureAvailable call.
   * Optionally logs a livelock warning with stack if the wait exceeds livelockDetectMs.
   * @param {number} [bytes=1024]
   * @returns {boolean | Promise<boolean>}
   */
  ensureAvailable(bytes = 1024) {
    if (this.isAvailable(bytes)) return true;
    const entry = { bytes };
    this._pendingEnsureAvailableEntries.push(entry);
    let stackCapture = null;
    if (this._livelockDetectMs > 0) {
      const err = new Error("[TrackableReadBufferStream ensureAvailable]");
      stackCapture = err.stack || String(err);
    }
    const result = super.ensureAvailable(bytes);
    if (result && typeof result.then === "function") {
      const livelockMs = this._livelockDetectMs;
      if (livelockMs > 0 && stackCapture) {
        const timer = setTimeout(() => {
          const idx = this._pendingEnsureAvailableEntries.indexOf(entry);
          if (idx !== -1) {
            console.warn(
              `[TrackableReadBufferStream] Possible livelock: ensureAvailable(${bytes}) still pending after ${livelockMs}ms. Stream: offset=${this.offset} endOffset=${this.endOffset} isComplete=${this.isComplete}. Call stack at ensureAvailable:`
            );
            process.stderr.write(stackCapture + '\n');
          }
        }, livelockMs);
        return result.then(
          r => {
            clearTimeout(timer);
            const i = this._pendingEnsureAvailableEntries.indexOf(entry);
            if (i !== -1) this._pendingEnsureAvailableEntries.splice(i, 1);
            return r;
          },
          e => {
            clearTimeout(timer);
            const i = this._pendingEnsureAvailableEntries.indexOf(entry);
            if (i !== -1) this._pendingEnsureAvailableEntries.splice(i, 1);
            throw e;
          }
        );
      }
      return result.then((r) => {
        const i = this._pendingEnsureAvailableEntries.indexOf(entry);
        if (i !== -1) this._pendingEnsureAvailableEntries.splice(i, 1);
        return r;
      });
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
    return this._pendingEnsureAvailableEntries.map((e) => e.bytes);
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
