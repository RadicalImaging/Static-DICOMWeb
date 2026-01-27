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
   * @returns {Object} - Stream info object (without promise, streamKey)
   * @protected
   */
  _openStream(relativePath, filename, options = {}) {
    console.verbose("openStream", relativePath, filename);
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
    const fullRelativePath = `${streamInfo.relativePath}/${streamInfo.filename}`.replace(/\\/g, '/');
    if (streamInfo._ended) {
      return fullRelativePath;
    }
    streamInfo.stream.end();
    return new Promise((resolve, reject) => {
      const fileStream = streamInfo.fileStream;
      fileStream.on('finish', () => resolve(fullRelativePath));
      fileStream.on('error', reject);
      streamInfo.stream.on('error', reject);
    });
  }
}
