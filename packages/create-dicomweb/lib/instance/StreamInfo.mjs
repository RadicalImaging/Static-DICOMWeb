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

    /** @type {Array<{ buffers?: Buffer[], run?: () => Promise<void>, resolve?: () => void, reject?: (err: Error) => void }>} */
    this._queue = [];
    this._processing = false;

    const completionPromise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this.promise = completionPromise;
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
      console.warn(`Error destroying stream ${this.streamKey ?? 'unknown'}:`, destroyError);
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
          const ok = stream.write(buf);
          if (!ok) {
            await new Promise(res => stream.once('drain', res));
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
      this._ended = true;
      return;
    }

    const s = this.stream;
    const fs = this.fileStream ?? s;
    const destroyed = s?.destroyed ?? false;
    if (destroyed) {
      this._ended = true;
      return;
    }

    return new Promise(resolve => {
      const done = () => {
        this._ended = true;
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
