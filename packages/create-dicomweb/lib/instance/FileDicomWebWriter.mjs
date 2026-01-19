import fs from 'fs';
import path from 'path';
import { createGzip } from 'zlib';
import { DicomWebWriter } from './DicomWebWriter.mjs';

/**
 * File-based implementation of DicomWebWriter
 * Writes DICOMweb files to the filesystem
 */
export class FileDicomWebWriter extends DicomWebWriter {

  /**
   * Creates a write stream (with optional gzip compression)
   * @param {string} filepath - Full path to the file
   * @param {boolean} shouldGzip - Whether to gzip the stream
   * @returns {Object} - { stream, fileStream }
   * @private
   */
  _createWriteStream(filepath, shouldGzip) {
    const fileWriteStream = fs.createWriteStream(filepath);

    if (shouldGzip) {
      const gzipStream = createGzip();
      gzipStream.pipe(fileWriteStream);
      gzipStream.on('error', (error) => {
        fileWriteStream.destroy(error);
      });
      return { stream: gzipStream, fileStream: fileWriteStream };
    }

    return { stream: fileWriteStream, fileStream: fileWriteStream };
  }

  /**
   * Protected method to create the actual stream implementation
   * @param {string} relativePath - The relative path within baseDir
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options
   * @returns {Promise<Object>} - Stream info object (without promise, streamKey)
   * @protected
   */
  async _openStream(relativePath, filename, options = {}) {
    const fullPath = path.join(this.options.baseDir, relativePath);
    
    // Ensure directory exists
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    const shouldGzip = options.gzip ?? false;
    const actualFilename = shouldGzip && !filename.endsWith('.gz') 
      ? `${filename}.gz` 
      : filename;
    
    const filepath = path.join(fullPath, actualFilename);
    const { stream, fileStream } = this._createWriteStream(filepath, shouldGzip);
    
    const streamInfo = {
      stream,
      fileStream,
      filepath,
      filename: actualFilename,
      relativePath,
      gzipped: shouldGzip,
      contentType: options.contentType || 'application/octet-stream',
      ...options
    };

    return streamInfo;
  }

  /**
   * Protected method to actually close the stream
   * @param {string} streamKey - The key identifying the stream
   * @param {Object} streamInfo - The stream info object
   * @returns {Promise<string>} - The relative path to the written file
   * @protected
   */
  async _closeStream(streamKey, streamInfo) {
    // End the stream (could be multipart-wrapped or direct)
    // If multipart, this will trigger the footer writing and then end the wrapped stream
    streamInfo.stream.end();

    // Wait for the file stream to finish
    // Use the fileStream which is always the actual file stream (not wrapped)
    return new Promise((resolve, reject) => {
      const fileStream = streamInfo.fileStream;
      
      fileStream.on('finish', () => {
        // Return relative path (relativePath includes the directory, add filename)
        const fullRelativePath = `${streamInfo.relativePath}/${streamInfo.filename}`.replace(/\\/g, '/');
        resolve(fullRelativePath);
      });
      
      fileStream.on('error', reject);
      
      // Listen for errors on the top-level stream (could be multipart or gzip)
      streamInfo.stream.on('error', reject);
    });
  }
}
