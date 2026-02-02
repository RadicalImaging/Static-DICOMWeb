import { v4 as uuid } from 'uuid';
import { createGzip } from 'zlib';
import { uids } from '@radicalimaging/static-wado-util';
import { MultipartStreamWriter } from './MultipartStreamWriter.mjs';
import { StreamInfo } from './StreamInfo.mjs';

/**
 * Base class for writing DICOMweb outputs
 * Defines the interface for writing files at different hierarchy levels
 */
export class DicomWebWriter {
  /**
   * @param {Object} informationProvider - The information provider instance with UIDs
   * @param {Object} options - Configuration options (required)
   * @param {string} options.baseDir - Base directory for output
   */
  constructor(informationProvider, options) {
    if (!informationProvider || typeof informationProvider !== 'object') {
      throw new Error('informationProvider object is required for DicomWebWriter');
    }
    if (!options || typeof options !== 'object') {
      throw new Error('options object is required for DicomWebWriter');
    }
    if (!options.baseDir) {
      throw new Error('options.baseDir is required for DicomWebWriter');
    }
    this.informationProvider = informationProvider;
    this.options = options;
    this.openStreams = new Map(); // key -> stream info
    this.streamErrors = new Map(); // key -> error
  }

  /**
   * Gets the current information object
   * @returns {Object} - Information object with UIDs
   * @private
   */
  _getInformation() {
    return this.informationProvider || {};
  }

  /**
   * Gets the Study Instance UID
   * @returns {string|undefined}
   */
  getStudyUID() {
    const info = this._getInformation();
    return info.studyInstanceUid;
  }

  /**
   * Gets the Series Instance UID
   * @returns {string|undefined}
   */
  getSeriesUID() {
    const info = this._getInformation();
    return info.seriesInstanceUid;
  }

  /**
   * Gets the SOP Instance UID
   * @returns {string|undefined}
   */
  getSOPInstanceUID() {
    const info = this._getInformation();
    return info.sopInstanceUid;
  }

  /**
   * Gets the Transfer Syntax UID
   * @returns {string|undefined}
   */
  getTransferSyntaxUID() {
    const info = this._getInformation();
    return info.transferSyntaxUid;
  }

  /**
   * Opens a stream at a given path (concrete implementation)
   * @param {string} path - The relative path within baseDir (e.g., 'studies/{studyUID}')
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options (contentType, gzip, multipart, etc.)
   * @param {string} options.path - Additional path segment to append to the base path
   * @param {boolean} options.gzip - Whether to gzip the stream
   * @param {boolean} options.multipart - Whether to wrap as multipart/related
   * @param {string} options.boundary - Multipart boundary (required if multipart=true)
   * @param {string} options.contentType - Content type for multipart part
   * @returns {Object} - Stream info object with promise property
   */
  openStream(path, filename, options = {}) {
    // Handle path options - append additional path if provided
    if (options.path) {
      path += (options.path.startsWith('/') ? '' : '/') + options.path;
    }

    // Determine if gzip is needed and update filename if necessary
    const shouldGzip = options.gzip ?? false;
    const actualFilename = shouldGzip && !filename.endsWith('.gz') ? `${filename}.gz` : filename;

    // Call the protected implementation to get the base stream (with updated filename)
    const data = this._openStream(path, actualFilename, options);

    // Track the target stream for wrapping (starts as the file stream)
    let targetStream = data.stream;
    if (shouldGzip) {
      const gzipStream = createGzip();
      gzipStream.pipe(targetStream); // gzip pipes to file stream
      gzipStream.on('error', error => {
        targetStream.destroy(error);
      });

      data.gzipStream = gzipStream;
      targetStream = gzipStream;
    }
    data.gzipped = shouldGzip;

    if (options.multipart) {
      const multipartStream = new MultipartStreamWriter(targetStream, {
        boundary: options.boundary,
        contentType: options.contentType || 'application/octet-stream',
        contentLocation: data.filename,
      });

      data.wrappedStream = targetStream;
      targetStream = multipartStream;
      data.isMultipart = true;
    }

    data.stream = targetStream;
    data.filename = actualFilename;

    const streamKey = options.streamKey || `${path.replace(/\\/g, '/')}:${data.filename}`;
    data.streamKey = streamKey;

    const streamInfo = new StreamInfo(this, data);
    this.openStreams.set(streamKey, streamInfo);

    return streamInfo;
  }

  /**
   * Protected method to create the actual stream implementation
   * Subclasses must implement this method
   * @param {string} path - The relative path within baseDir
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options
   * @returns {Object} - Stream info object (without promise)
   * @protected
   */
  _openStream(path, filename, options = {}) {
    throw new Error('_openStream must be implemented by subclass');
  }

  /**
   * Opens a stream at the study level
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options (contentType, gzip, etc.)
   * @returns {Promise<Object>} - Stream info object
   */
  async openStudyStream(filename, options = {}) {
    const studyUID = this.getStudyUID();
    if (!studyUID) {
      throw new Error('StudyInstanceUID is required to open study stream');
    }
    const path = `studies/${studyUID}`;
    return this.openStream(path, filename, options);
  }

  /**
   * Opens a stream at the series level
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options (contentType, gzip, path, etc.)
   * @param {string} options.path - Additional path segment to append
   * @returns {Promise<Object>} - Stream info object
   */
  async openSeriesStream(filename, options = {}) {
    const studyUID = this.getStudyUID();
    const seriesUID = this.getSeriesUID();
    if (!studyUID || !seriesUID) {
      throw new Error('StudyInstanceUID and SeriesInstanceUID are required to open series stream');
    }
    const path = `studies/${studyUID}/series/${seriesUID}`;
    return this.openStream(path, filename, options);
  }

  /**
   * Opens a stream at the instance level
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options (contentType, gzip, path, etc.)
   * @param {string} options.path - Additional path segment to append
   * @returns {Promise<Object>} - Stream info object
   */
  async openInstanceStream(filename, options = {}) {
    const studyUID = this.getStudyUID();
    const seriesUID = this.getSeriesUID();
    const sopUID = this.getSOPInstanceUID();
    if (!studyUID || !seriesUID || !sopUID) {
      throw new Error(
        'StudyInstanceUID, SeriesInstanceUID, and SOPInstanceUID are required to open instance stream'
      );
    }
    const path = `studies/${studyUID}/series/${seriesUID}/instances/${sopUID}`;
    return this.openStream(path, filename, options);
  }

  /**
   * Opens a stream at the frame level
   * @param {number} frameNumber - The frame number (1-based)
   * @param {Object} options - Stream options (contentType, gzip, boundary, etc.)
   * @returns {Object} - Stream info object
   */
  openFrameStream(frameNumber, options = {}) {
    const studyUID = this.getStudyUID();
    const seriesUID = this.getSeriesUID();
    const sopUID = this.getSOPInstanceUID();
    if (!studyUID || !seriesUID || !sopUID) {
      throw new Error(
        'StudyInstanceUID, SeriesInstanceUID, and SOPInstanceUID are required to open frame stream'
      );
    }
    const path = `studies/${studyUID}/series/${seriesUID}/instances/${sopUID}/frames`;

    const tsUID = this.getTransferSyntaxUID();

    // Determine content type based on transfer syntax UID
    const type = tsUID ? uids[tsUID] || uids.default || {} : {};
    const contentType = options.contentType || type.contentType || 'application/octet-stream';

    // Generate boundary ID
    const boundary = options.boundary || `BOUNDARY_${uuid()}`;

    // Build Content-Type header with transfer-syntax attribute if available
    let contentTypeHeader = contentType;
    if (tsUID) {
      contentTypeHeader = `${contentType};transfer-syntax=${tsUID}`;
    }
    console.verbose('TSUID:', tsUID);

    // Generate filename based on frame number and compression
    const shouldGzip = options.gzip ?? this._shouldGzipFrame(tsUID);
    const filename = shouldGzip ? `${frameNumber}.mht.gz` : `${frameNumber}.mht`;

    // Open the stream with multipart wrapping
    const streamInfo = this.openStream(path, filename, {
      ...options,
      gzip: shouldGzip,
      multipart: true,
      frameNumber,
      contentType: contentTypeHeader,
      boundary,
      streamKey: options.streamKey || `frame:${frameNumber}`,
    });

    return streamInfo;
  }

  /**
   * Determines if a frame should be gzipped based on transfer syntax
   * @param {string} tsUID - Transfer Syntax UID
   * @returns {boolean}
   * @protected
   */
  _shouldGzipFrame(tsUID) {
    if (!tsUID) return false;

    const type = uids[tsUID] || uids.default || {};
    return type.uncompressed === true || type.gzip === true;
  }

  /**
   * Closes a stream (concrete implementation).
   * Handles all errors internally and always returns a promise that resolves
   * (never rejects), even if the stream write or close fails.
   * Closing (drain, end, wait for finish) is handled by StreamInfo.end().
   * @param {string} streamKey - The key identifying the stream
   * @returns {Promise<string|undefined>} - Resolves with the relative path on success, or undefined on failure (error is recorded)
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

      this.openStreams.delete(streamKey);

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

      this.openStreams.delete(streamKey);

      return undefined;
    }
  }

  /**
   * Called by StreamInfo.recordFailure. Records the error and terminates the stream.
   * @param {string} streamKey - The key identifying the stream
   * @param {StreamInfo} streamInfo - The stream info (unused, kept for signature)
   * @param {Error} error - The error that occurred
   * @private
   */
  _recordStreamFailure(streamKey, streamInfo, error) {
    this.recordStreamError(streamKey, error, true);
  }

  /**
   * Gets all currently open streams
   * @returns {Map} - Map of streamKey -> stream info
   */
  getOpenStreams() {
    return this.openStreams;
  }

  /**
   * Waits for all open streams to complete
   * Does NOT close the streams - they must be closed separately
   * @returns {Promise<string[]>} - Array of relative paths to written files
   */
  async awaitAllStreams() {
    const promises = [];
    for (const streamInfo of this.openStreams.values()) {
      if (streamInfo.promise) {
        promises.push(streamInfo.promise);
      }
    }
    return Promise.allSettled(promises);
  }

  /**
   * Records an error that occurred during writing for a specific stream
   * This terminates the stream handling and marks it as failed
   * @param {string} streamKey - The key identifying the stream
   * @param {Error} error - The error that occurred
   * @param {boolean} skipPromiseReject - If true, don't reject the promise (used when error is already handled elsewhere)
   */
  recordStreamError(streamKey, error, skipPromiseReject = false) {
    const streamInfo = this.openStreams.get(streamKey);
    if (!streamInfo) {
      // Stream not found, but still record the error
      this.streamErrors.set(streamKey, error);
      return;
    }

    // Record the error
    this.streamErrors.set(streamKey, error);
    streamInfo.error = error;
    streamInfo.failed = true;

    streamInfo.destroyStreams(error);

    // Only reject the promise if it hasn't been replaced and we're not skipping rejection
    if (!skipPromiseReject && streamInfo._reject) {
      try {
        streamInfo._reject(error);
      } catch (rejectError) {
        // If rejecting causes an error (e.g., promise already settled), ignore it
        // This prevents unhandled rejections from terminating the process
      }
    }

    // Remove from open streams (stream is terminated, no longer active)
    this.openStreams.delete(streamKey);
  }

  /**
   * Gets all stream errors that occurred during writing
   * @returns {Map<string, Error>} - Map of streamKey -> error
   */
  getStreamErrors() {
    return this.streamErrors;
  }

  /**
   * Checks if any stream errors occurred
   * @returns {boolean} - True if any errors were recorded
   */
  hasStreamErrors() {
    return this.streamErrors.size > 0;
  }

  /**
   * Gets a summary of all stream errors
   * @returns {Array<{streamKey: string, error: Error}>} - Array of error objects
   */
  getStreamErrorSummary() {
    return Array.from(this.streamErrors.entries()).map(([streamKey, error]) => ({
      streamKey,
      error,
    }));
  }
}
