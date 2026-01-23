import fs from 'fs';
import path from 'path';
import { DicomWebWriter } from './DicomWebWriter.mjs';

/**
 * File-based implementation of DicomWebWriter
 * Writes DICOMweb files to the filesystem
 */
export class FileDicomWebWriter extends DicomWebWriter {

  /**
   * Protected method to create the actual stream implementation
   * @param {string} relativePath - The relative path within baseDir
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options
   * @returns {Promise<Object>} - Stream info object (without promise, streamKey)
   * @protected
   */
  async _openStream(relativePath, filename, options = {}) {
    console.log("openStream", relativePath, filename);
    const fullPath = path.join(this.options.baseDir, relativePath);
    
    // Ensure directory exists
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    const filepath = path.join(fullPath, filename);
    const fileStream = fs.createWriteStream(filepath);
    
    const streamInfo = {
      stream: fileStream,
      fileStream,
      filepath,
      filename,
      relativePath,
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
    // End the stream (could be gzip-wrapped, multipart-wrapped, or direct)
    // If gzip, this will flush and end, cascading to multipart (if present) or fileStream
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
