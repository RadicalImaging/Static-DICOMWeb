import { data } from "dcmjs";

const { ReadBufferStream } = data;

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
 */
export class TrackableReadBufferStream extends ReadBufferStream {
  constructor(buffer, littleEndian, options = {}) {
    super(buffer, littleEndian, options);
    /** @type {{ bytes: number }[]} */
    this._pendingEnsureAvailableEntries = [];
  }

  /**
   * Override to track desired bytes for each pending ensureAvailable call.
   * @param {number} [bytes=1024]
   * @returns {boolean | Promise<boolean>}
   */
  ensureAvailable(bytes = 1024) {
    if (this.isAvailable(bytes)) return true;
    const entry = { bytes };
    this._pendingEnsureAvailableEntries.push(entry);
    const result = super.ensureAvailable(bytes);
    if (result && typeof result.then === "function") {
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
