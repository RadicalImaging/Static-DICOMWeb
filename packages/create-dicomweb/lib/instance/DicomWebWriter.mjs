import { v4 as uuid } from 'uuid';
import { uids } from '@radicalimaging/static-wado-creator';
import { MultipartStreamWriter } from './MultipartStreamWriter.mjs';

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
   * @param {boolean} options.multipart - Whether to wrap as multipart/related
   * @param {string} options.boundary - Multipart boundary (required if multipart=true)
   * @param {string} options.contentType - Content type for multipart part
   * @returns {Promise<Object>} - Stream info object with promise property
   */
  async openStream(path, filename, options = {}) {
    // Call the protected implementation to get the base stream
    const streamInfo = await this._openStream(path, filename, options);
    
    // Wrap with multipart if requested
    if (options.multipart) {
      const multipartStream = new MultipartStreamWriter(streamInfo.stream, {
        boundary: options.boundary,
        contentType: options.contentType || 'application/octet-stream',
        contentLocation: streamInfo.filename
      });
      
      // Store the original stream and replace with multipart wrapper
      streamInfo.wrappedStream = streamInfo.stream;
      streamInfo.stream = multipartStream;
      streamInfo.isMultipart = true;
    }
    
    // Create a promise that will be resolved when the stream is closed
    let resolvePromise;
    let rejectPromise;
    const completionPromise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    
    // Add promise resolvers to the stream info
    streamInfo.promise = completionPromise;
    streamInfo._resolve = resolvePromise;
    streamInfo._reject = rejectPromise;
    
    // Generate a unique stream key if not provided
    const streamKey = options.streamKey || `${path.replace(/\\/g, '/')}:${streamInfo.filename}`;
    streamInfo.streamKey = streamKey;
    
    // Add to open streams
    this.openStreams.set(streamKey, streamInfo);
    
    return streamInfo;
  }

  /**
   * Protected method to create the actual stream implementation
   * Subclasses must implement this method
   * @param {string} path - The relative path within baseDir
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options
   * @returns {Promise<Object>} - Stream info object (without promise)
   * @protected
   */
  async _openStream(path, filename, options = {}) {
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
   * @param {Object} options - Stream options (contentType, gzip, etc.)
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
   * @param {Object} options - Stream options (contentType, gzip, etc.)
   * @returns {Promise<Object>} - Stream info object
   */
  async openInstanceStream(filename, options = {}) {
    const studyUID = this.getStudyUID();
    const seriesUID = this.getSeriesUID();
    const sopUID = this.getSOPInstanceUID();
    if (!studyUID || !seriesUID || !sopUID) {
      throw new Error('StudyInstanceUID, SeriesInstanceUID, and SOPInstanceUID are required to open instance stream');
    }
    const path = `studies/${studyUID}/series/${seriesUID}/instances/${sopUID}`;
    return this.openStream(path, filename, options);
  }

  /**
   * Opens a stream at the frame level
   * @param {number} frameNumber - The frame number (1-based)
   * @param {Object} options - Stream options (contentType, gzip, boundary, etc.)
   * @returns {Promise<Object>} - Stream info object
   */
  async openFrameStream(frameNumber, options = {}) {
    const studyUID = this.getStudyUID();
    const seriesUID = this.getSeriesUID();
    const sopUID = this.getSOPInstanceUID();
    if (!studyUID || !seriesUID || !sopUID) {
      throw new Error('StudyInstanceUID, SeriesInstanceUID, and SOPInstanceUID are required to open frame stream');
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
    console.log("contentTypeHeader", contentTypeHeader, tsUID)
    
    // Generate filename based on frame number and compression
    const shouldGzip = options.gzip ?? this._shouldGzipFrame(tsUID);
    const filename = shouldGzip ? `${frameNumber}.mht.gz` : `${frameNumber}.mht`;
    
    // Open the stream with multipart wrapping
    const streamInfo = await this.openStream(path, filename, { 
      ...options, 
      gzip: shouldGzip, 
      multipart: true,
      frameNumber,
      contentType: contentTypeHeader,
      boundary,
      streamKey: options.streamKey || `frame:${frameNumber}`
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
   * Closes a stream (concrete implementation)
   * Subclasses should override _closeStream for specific implementation
   * @param {string} streamKey - The key identifying the stream
   * @returns {Promise<string>} - The relative path to the written file
   */
  async closeStream(streamKey) {
    const streamInfo = this.openStreams.get(streamKey);
    if (!streamInfo) {
      return undefined;
    }

    try {
      // Call the protected close implementation
      // (multipart footer is written automatically by MultipartStreamWriter.end())
      const relativePath = await this._closeStream(streamKey, streamInfo);
      
      // Resolve the promise
      if (streamInfo._resolve) {
        streamInfo._resolve(relativePath);
      }
      
      // Remove from open streams
      this.openStreams.delete(streamKey);
      
      return relativePath;
    } catch (error) {
      // Reject the promise on error
      if (streamInfo._reject) {
        streamInfo._reject(error);
      }
      
      // Still remove from open streams
      this.openStreams.delete(streamKey);
      
      throw error;
    }
  }

  /**
   * Protected method to actually close the stream
   * Subclasses must implement this method
   * @param {string} streamKey - The key identifying the stream
   * @param {Object} streamInfo - The stream info object
   * @returns {Promise<string>} - The relative path to the written file
   * @protected
   */
  async _closeStream(streamKey, streamInfo) {
    throw new Error('_closeStream must be implemented by subclass');
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
    return Promise.all(promises);
  }
}
