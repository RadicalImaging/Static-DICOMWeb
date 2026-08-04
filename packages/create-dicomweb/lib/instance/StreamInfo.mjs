/** Total number of streams currently open (all StreamInfo instances) */
let streamOpenCount = 0;
/** Total number of streams closed (all StreamInfo instances, cumulative) */
let streamClosedCount = 0;

/**
 * Returns current global stream open and closed counts (for logging from DicomWebWriter).
 * @returns {{ streamOpenCount: number, streamClosedCount: number }}
 */
export function getStreamCounts() {
  return { streamOpenCount, streamClosedCount };
}
/** High-water log threshold; log when open count exceeds this */
const STREAM_OPEN_WARN_THRESHOLD = 500;
/** Log again every this many beyond the threshold */
const STREAM_OPEN_WARN_STEP = 100;
/** Next count at which to log (500, 600, 700, …); reset when count drops below threshold */
let _streamOpenNextLogAt = STREAM_OPEN_WARN_THRESHOLD;
/** Max time to wait for a 'drain' event before writing more data */
const DRAIN_WAIT_MS = 250;

/**
 * Waits until a stream drains, resolving early if it errors/closes, and after timeoutMs at the latest.
 * Every listener added is removed again, so instances with thousands of frames don't accumulate
 * 'drain' listeners on their streams (which leaks memory and triggers MaxListenersExceededWarning).
 * @param {import('stream').Writable} stream - The stream that returned false from write()
 * @param {number} timeoutMs - Max time to wait for the drain event
 * @returns {Promise<void>}
 */
function waitForDrain(stream, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      stream.removeListener('drain', finish);
      stream.removeListener('close', finish);
      resolve();
    };
    const timeoutId = setTimeout(finish, timeoutMs);
    stream.once('drain', finish);
    stream.once('close', finish);
  });
}

/**
 * Normalizes a value to an array of Buffers. Supports ArrayBuffer, Buffer, TypedArray, or Array of same.
 * @param {ArrayBuffer|Buffer|TypedArray|Array<ArrayBuffer|Buffer|TypedArray>} value
 * @returns {Buffer[]}
 * @throws {Error} If value type is unsupported
 */
function toBuffers(value) {
  if (value instanceof ArrayBuffer) {
    return [Buffer.from(value)];
  }
  if (Buffer.isBuffer(value)) {
    return [value];
  }
  if (ArrayBuffer.isView(value)) {
    return [Buffer.from(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(toBuffers);
  }
  throw new Error(
    `Unsupported binary value type: ${typeof value}${value?.constructor?.name ? ` (${value.constructor.name})` : ''}. Expected ArrayBuffer or Buffer.`
  );
}

/**
 * StreamInfo encapsulates an open write stream and its failure/write behaviour.
 * Provides write() (sync, handles binary types/arrays, backpressure, queue), and end().
 * recordFailure marks the stream as failed; getFailureMessage() retrieves the failure.
 * end() waits until all data is flushed, records when ended and any failures, and never throws.
 */
export class StreamInfo {
  /**
   * @param {Object} writer - The DicomWebWriter instance (used for _recordStreamFailure)
   * @param {Object} data - Stream data: streamKey, stream, filename, fileStream, and any other properties
   *   (e.g. relativePath, gzipStream, wrappedStream, gzipped, isMultipart, etc.)
   */
  constructor(writer, data) {
    this.writer = writer;
    Object.assign(this, data);

    this.failed = false;
    this.error = null;
    this._ended = false;
    this._closedLogged = false;

    /** @type {Array<{ buffers?: Buffer[], run?: () => Promise<void>, resolve?: () => void, reject?: (err: Error) => void }>} */
    this._queue = [];
    this._processing = false;

    streamOpenCount += 1;
    if (streamOpenCount >= _streamOpenNextLogAt) {
      const excess = streamOpenCount - STREAM_OPEN_WARN_THRESHOLD;
      console.noQuiet(
        `[StreamInfo] open file count exceeded ${STREAM_OPEN_WARN_THRESHOLD} by ${excess}: totalOpen=${streamOpenCount} totalClosed=${streamClosedCount}`
      );
      _streamOpenNextLogAt =
        STREAM_OPEN_WARN_THRESHOLD +
        STREAM_OPEN_WARN_STEP * Math.floor(excess / STREAM_OPEN_WARN_STEP) +
        STREAM_OPEN_WARN_STEP;
    }
    console.verbose(
      `[StreamInfo] open stream streamKey=${this.streamKey ?? 'unknown'} totalOpen=${streamOpenCount} totalClosed=${streamClosedCount}`
    );

    const completionPromise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this.promise = completionPromise;

    this._attachErrorHandlers();
  }

  /**
   * Listens for errors on all of this stream's layers so a failure (disk full, EPIPE, …)
   * records the failure and destroys the streams. Without this, an error emitted before
   * end() attaches its handlers either crashes the process as an unhandled 'error' event
   * or leaves the file handle open forever, since 'finish' never arrives after an error.
   * @private
   */
  _attachErrorHandlers() {
    const onError = error => {
      if (this._ended || this.failed) return;
      console.verbose(
        `[StreamInfo] error on stream ${this.streamKey ?? 'unknown'}: ${error?.message ?? error}`
      );
      this.recordFailure(error);
    };
    for (const stream of [this.stream, this.gzipStream, this.fileStream]) {
      if (stream && typeof stream.once === 'function') {
        stream.once('error', onError);
      }
    }
  }

  /**
   * Logs stream close and updates open/closed counts. Called at most once per instance.
   * @private
   */
  _markClosed() {
    if (this._closedLogged) return;
    this._closedLogged = true;
    streamOpenCount -= 1;
    if (streamOpenCount < STREAM_OPEN_WARN_THRESHOLD) {
      _streamOpenNextLogAt = STREAM_OPEN_WARN_THRESHOLD;
    }
    streamClosedCount += 1;
    console.verbose(
      `[StreamInfo] close stream streamKey=${this.streamKey ?? 'unknown'} totalOpen=${streamOpenCount} totalClosed=${streamClosedCount}`
    );
  }

  /**
   * Records a failure for this stream. Records the error; subsequent writes are no-ops until close.
   * Handles all error recording synchronously without throwing. Marks this stream as failed
   * and notifies the writer; any internal errors are swallowed so this method never throws.
   * @param {Error} error - The error that occurred
   */
  recordFailure(error) {
    this.failed = true;
    this.error = error;
    try {
      this.writer._recordStreamFailure(this.streamKey, this, error);
    } catch (_) {
      // Internal recording failed; we're already in failure state, don't throw
    }
  }

  /**
   * Terminates the stream by destroying stream, gzipStream (if present), and fileStream (if present).
   * Never throws; errors during destruction are caught and warned.
   * @param {Error} error - The error to pass to destroy()
   */
  destroyStreams(error) {
    this._markClosed();
    // Reject the completion promise (tracked by streamWritePromiseTracker)
    if (this._reject && !this._ended) {
      this._reject(error);
      this._ended = true;
    }
    try {
      if (this.stream && typeof this.stream.destroy === 'function') {
        this.stream.destroy(error);
      }
      if (this.gzipStream && typeof this.gzipStream.destroy === 'function') {
        this.gzipStream.destroy(error);
      }
      if (this.fileStream && typeof this.fileStream.destroy === 'function') {
        this.fileStream.destroy(error);
      }
    } catch (destroyError) {
      console.warn(`Error destroying stream ${this.streamKey}:`, destroyError);
    }
  }

  /**
   * Gets the failure message for this stream, if any.
   * @returns {string|null} - The error message, or null if no failure
   */
  getFailureMessage() {
    return this.error?.message ?? null;
  }

  /**
   * Returns the close result for this stream (e.g. relative path for file-based writers).
   * Used after end() to get the result of closing. Returns undefined if this stream
   * does not have path info (e.g. non-file writers).
   * @returns {string|undefined} - The close result (e.g. relative path), or undefined
   */
  getCloseResult() {
    if (this.relativePath != null && this.filename != null) {
      return `${this.relativePath}/${this.filename}`.replace(/\\/g, '/');
    }
    return undefined;
  }

  /**
   * Writes binary data to the stream. Accepts ArrayBuffer, Buffer, TypedArray, or Array of same.
   * Synchronous: returns backpressure as a boolean. When the queue is already being drained,
   * new data is appended to the queue and this returns false (caller should slow down or wait for 'drain').
   * @param {ArrayBuffer|Buffer|TypedArray|Array<ArrayBuffer|Buffer|TypedArray>} value - Data to write
   * @returns {boolean} - true = no backpressure (OK to continue); false = backpressure (queue busy, slow down)
   */
  write(value) {
    if (this.failed || this._ended) return true;
    const buffers = toBuffers(value).filter(b => b.length > 0);
    if (buffers.length === 0) return true;

    this._queue.push({ buffers });
    if (this._processing) return false;
    this._processing = true;
    void this._processQueue();
    return true;
  }

  async _processQueue() {
    const stream = this.stream;
    while (this._queue.length > 0) {
      const item = this._queue.shift();
      if (item.buffers) {
        for (const buf of item.buffers) {
          if (this.failed || stream.destroyed) break;
          const ok = stream.write(buf);
          if (!ok) {
            await waitForDrain(stream, DRAIN_WAIT_MS);
          }
        }
      } else if (item.run !== undefined) {
        try {
          await item.run();
          item.resolve?.();
        } catch (e) {
          item.reject?.(e);
        }
      }
    }
    this._processing = false;
  }

  /**
   * Drains the write queue, ends the stream, and waits until all data is flushed.
   * Records when end has taken place and any failures; never throws.
   * Failures are retrieved via getFailureMessage().
   * @returns {Promise<void>}
   */
  async end() {
    if (this._ended) {
      return;
    }

    const drainPromise = new Promise((resolve, reject) => {
      const run = async () => {};
      this._queue.push({ run, resolve, reject });
      if (!this._processing) {
        this._processing = true;
        void this._processQueue();
      }
    });
    await drainPromise;

    if (this.failed) {
      this._markClosed();
      this._ended = true;
      // Reject the completion promise (tracked by streamWritePromiseTracker)
      if (this._reject) {
        this._reject(this.error);
      }
      return;
    }

    const s = this.stream;
    const fs = this.fileStream ?? s;
    const destroyed = s?.destroyed ?? false;
    if (destroyed) {
      this._markClosed();
      this._ended = true;
      // Resolve the completion promise (tracked by streamWritePromiseTracker)
      // Stream was destroyed, but we treat it as complete
      if (this._resolve) {
        this._resolve();
      }
      return;
    }

    return new Promise(resolve => {
      const done = () => {
        this._markClosed();
        this._ended = true;
        // Resolve the completion promise (tracked by streamWritePromiseTracker)
        if (this.failed && this._reject) {
          console.verbose(
            `[StreamInfo] rejecting promise for ${this.streamKey ?? 'unknown'}: ${this.error?.message}`
          );
          this._reject(this.error);
        } else if (this._resolve) {
          console.verbose(`[StreamInfo] resolving promise for ${this.streamKey ?? 'unknown'}`);
          this._resolve();
        }
        resolve();
      };

      const onError = err => {
        this.recordFailure(err);
        cleanup();
        done();
      };

      const onFinish = () => {
        cleanup();
        done();
      };

      const cleanup = () => {
        fs.removeListener('finish', onFinish);
        fs.removeListener('error', onError);
        if (s !== fs) s.removeListener('error', onError);
      };

      fs.once('finish', onFinish);
      fs.once('error', onError);
      if (s !== fs) s.once('error', onError);

      try {
        s.end();
      } catch (err) {
        this.recordFailure(err);
        cleanup();
        done();
      }
    });
  }
}
