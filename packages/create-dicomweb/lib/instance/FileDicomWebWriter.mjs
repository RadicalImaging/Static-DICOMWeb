import fs from 'fs';
import path from 'path';
import { DicomWebWriter } from './DicomWebWriter.mjs';

/**
 * File-based implementation of DicomWebWriter
 * Writes DICOMweb files to the filesystem
 */
export class FileDicomWebWriter extends DicomWebWriter {
  /**
   * Deletes a file and its .gz counterpart if present. Ignores ENOENT.
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to delete (without .gz)
   */
  delete(relativePath, filename) {
    const fullPath = path.join(this.options.baseDir, relativePath, filename);
    for (const p of [fullPath, `${fullPath}.gz`]) {
      try {
        fs.unlinkSync(p);
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          console.warn(`[FileDicomWebWriter] Could not delete ${p}:`, err?.message || err);
        }
      }
    }
  }

  /**
   * Protected method to create the actual stream implementation
   * @param {string} relativePath - The relative path within baseDir
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options
   * @returns {Object} - Stream info object (without promise, streamKey)
   * @protected
   */
  _openStream(relativePath, filename, options = {}) {
    console.verbose('openStream', relativePath, filename);
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
      ...options,
    };

    return streamInfo;
  }
}
