import { Writable } from 'stream';
import { v4 as uuid } from 'uuid';
import { DicomWebWriter } from './DicomWebWriter.mjs';

/**
 * Writable that writes a single multipart/related part to an Express response.
 * Does not end the response; the writer finalizes the response when the last stream is closed.
 */
class MultipartPartStream extends Writable {
  /**
   * @param {Object} response - Express response object
   * @param {string} boundary - Multipart boundary
   * @param {string} contentLocation - Content-Location (filename) for this part
   */
  constructor(response, boundary, contentLocation) {
    super();
    this.response = response;
    this.boundary = boundary;
    this.contentLocation = contentLocation;
    this.headerWritten = false;
  }

  _write(chunk, encoding, callback) {
    if (!this.headerWritten) {
      this.headerWritten = true;
      const header =
        `--${this.boundary}\r\n` +
        `Content-Type: application/dicom\r\n` +
        `Content-Location: ${this.contentLocation}\r\n` +
        `\r\n`;
      this.response.write(header, 'utf8', err => {
        if (err) return callback(err);
        this.response.write(chunk, encoding, callback);
      });
    } else {
      this.response.write(chunk, encoding, callback);
    }
  }

  _final(callback) {
    this.response.write('\r\n', 'utf8', callback);
  }
}

/**
 * DicomWebWriter that streams Part 10 instances to an Express response as multipart/related.
 * Use location "multipart:" with DicomWebStream.createWriter and options { response }.
 */
export class MultipartResponseDicomWebWriter extends DicomWebWriter {
  /**
   * @param {Object} informationProvider - The information provider instance with UIDs
   * @param {Object} options - Configuration options
   * @param {import('express').Response} options.response - Express response object to stream to
   */
  constructor(informationProvider, options = {}) {
    if (!options?.response) {
      throw new Error('options.response (Express response) is required for MultipartResponseDicomWebWriter');
    }
    super(informationProvider, { ...options, baseDir: '.' });
    this.response = options.response;
    this._boundary = null;
    this._headersSent = false;
    this._responseFinalized = false;
  }

  _getBoundary() {
    if (!this._boundary) {
      this._boundary = `BOUNDARY_${uuid().replace(/-/g, '')}`;
    }
    return this._boundary;
  }

  _ensureResponseHeaders() {
    if (this._headersSent) return;
    this._headersSent = true;
    const boundary = this._getBoundary();
    this.response.setHeader(
      'Content-Type',
      `multipart/related; type="application/dicom"; boundary=${boundary}`
    );
  }

  /**
   * @param {string} path - Ignored; path is not used for response streaming
   * @param {string} filename - Used as Content-Location for the part
   * @param {Object} options - Stream options
   * @returns {Object} - Stream info with stream writing to the response
   * @protected
   */
  _openStream(path, filename, options = {}) {
    this._ensureResponseHeaders();
    const boundary = this._getBoundary();
    const partStream = new MultipartPartStream(this.response, boundary, filename);
    return {
      stream: partStream,
      fileStream: partStream,
      filename,
      relativePath: path,
      contentType: 'application/dicom',
      ...options,
    };
  }

  /**
   * Writes the closing boundary and ends the response. Only the first call does anything, so it
   * is safe to call from every path that can be the last one.
   * @returns {Promise<void>}
   * @private
   */
  _finalizeResponse() {
    if (this._responseFinalized || !this.response || this.response.writableEnded) {
      return Promise.resolve();
    }
    this._responseFinalized = true;
    const closing = `\r\n--${this._getBoundary()}--\r\n`;
    return new Promise((resolve, reject) => {
      try {
        this.response.write(closing, 'utf8', err => {
          if (err) {
            reject(err);
            return;
          }
          this.response.end(() => resolve());
        });
      } catch (error) {
        try {
          this.response.end();
        } catch (_) {
          // Response is already unusable; nothing further to do
        }
        reject(error);
      }
    });
  }

  /**
   * Finalizes the response when the last stream is drained rather than closed. drainOpenStreams
   * can finish a stream without closeStream running, and the response has to be ended either
   * way or the client waits forever.
   * @returns {Promise<void>}
   * @protected
   */
  async _onAllStreamsDrained() {
    await this._finalizeResponseSafely();
  }

  /**
   * _finalizeResponse without the rejection, for callers documented never to throw.
   * @returns {Promise<void>}
   * @private
   */
  async _finalizeResponseSafely() {
    try {
      await this._finalizeResponse();
    } catch (error) {
      console.warn(
        `[MultipartResponseDicomWebWriter] Failed to finalize response: ${error?.message ?? error}`
      );
    }
  }

  /**
   * Closes the stream and, if this was the last open stream, finalizes the multipart response.
   * @param {string} streamKey - The key identifying the stream
   * @returns {Promise<string|undefined>}
   */
  async closeStream(streamKey) {
    const streamInfo = this.openStreams.get(streamKey);
    if (!streamInfo) {
      return undefined;
    }

    try {
      await streamInfo.end();
      const relativePath = streamInfo.failed ? undefined : streamInfo.getCloseResult();

      if (streamInfo._resolve) {
        streamInfo._resolve(relativePath);
      }

      this._deleteOpenStream(streamKey);

      if (this.openStreams.size === 0) {
        await this._finalizeResponseSafely();
      }

      return relativePath;
    } catch (error) {
      try {
        this.recordStreamError(streamKey, error, true);
      } catch (recordErr) {
        console.error(`Error recording stream failure for ${streamKey}:`, recordErr);
      }

      if (streamInfo._resolve) {
        streamInfo._resolve(undefined);
      }

      this._deleteOpenStream(streamKey);

      if (this.openStreams.size === 0) {
        await this._finalizeResponseSafely();
      }

      return undefined;
    }
  }
}
