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
 * Provides write(), writeBinaryValue() (with backpressure and queue), and end().
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
   * Gets the failure message for this stream, if any.
   * @returns {string|null} - The error message, or null if no failure
   */
  getFailureMessage() {
    return this.error?.message ?? null;
  }

  /**
   * Writes chunk to the stream. Returns the backpressure flag synchronously.
   * true = buffer has space, ok to keep writing; false = wait for 'drain' before writing more.
   * If the stream has recorded a failure, this is a no-op and returns true.
   * If the write fails (e.g. error in callback), recordFailure is called.
   * @param {string|Buffer|Uint8Array} chunk - Data to write
   * @returns {boolean} - Backpressure flag from stream.write()
   */
  write(chunk) {
    if (this.failed) {
      return true;
    }
    return this.stream.write(chunk, (err) => {
      if (err) {
        this.recordFailure(err);
      }
    });
  }

  /**
   * Writes a single binary value (ArrayBuffer, Buffer, TypedArray, or Array of same) to the stream.
   * Handles backpressure and queues multiple calls; use extend by calling again when more data arrives.
   * @param {ArrayBuffer|Buffer|TypedArray|Array<ArrayBuffer|Buffer|TypedArray>} value - Data to write
   * @returns {Promise<number>} - Resolves with bytes written; rejects on write error
   */
  writeBinaryValue(value) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        const buffers = toBuffers(value);
        let total = 0;
        for (const buf of buffers) {
          if (buf.length === 0) continue;
          const ok = this.write(buf);
          total += buf.length;
          if (!ok) {
            await new Promise((res) => this.stream.once('drain', res));
          }
        }
        return total;
      };
      this._queue.push({ run, resolve, reject });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this._processing || this._queue.length === 0) return;
    this._processing = true;
    while (this._queue.length > 0) {
      const { run, resolve, reject } = this._queue.shift();
      try {
        const n = await run();
        resolve(n);
      } catch (e) {
        reject(e);
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
      this._processQueue();
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

    return new Promise((resolve) => {
      const done = () => {
        this._ended = true;
        resolve();
      };

      const onError = (err) => {
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
