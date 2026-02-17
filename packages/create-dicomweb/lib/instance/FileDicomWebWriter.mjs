import fs from 'fs';
import path from 'path';
import { DicomWebWriter } from './DicomWebWriter.mjs';

/**
 * Derives the temp directory path for a given relativePath.
 * If relativePath starts with 'studies/<studyUID>/...', uses 'studies/<studyUID>/temp/'.
 * Otherwise uses 'studies/temp/'.
 * @param {string} relativePath - The relative path (e.g. 'studies/1.2.3/series/4.5.6')
 * @returns {string} - The temp directory relative path
 */
function getTempRelativePath(relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  if (parts[0] === 'studies' && parts.length >= 2 && parts[1]) {
    return `studies/${parts[1]}/temp`;
  }
  return 'studies/temp';
}

/**
 * Compares two files byte-by-byte.
 * @param {string} fileA - Path to first file
 * @param {string} fileB - Path to second file
 * @returns {boolean} - True if files are byte-identical
 */
function filesAreIdentical(fileA, fileB) {
  try {
    const statA = fs.statSync(fileA);
    const statB = fs.statSync(fileB);
    if (statA.size !== statB.size) return false;
    const bufA = fs.readFileSync(fileA);
    const bufB = fs.readFileSync(fileB);
    return bufA.equals(bufB);
  } catch {
    return false;
  }
}

/**
 * Write status values set on streamInfo.writeStatus after closeStream:
 * - 'identical'      : new file is byte-identical to existing; temp deleted, no rename
 * - 'created'        : new file; no previous version existed
 * - 'updated'        : replaced existing file that had the expected mtime
 * - 'updated-stale'  : replaced existing file whose mtime changed since open (another writer touched it)
 */

/**
 * File-based implementation of DicomWebWriter
 * Writes DICOMweb files to the filesystem using temp files for atomicity.
 * Files are written to a temp directory and moved to their final location on close.
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
   * Protected method to create the actual stream implementation.
   * Writes to a temp file and records original file metadata for safe replacement.
   * @param {string} relativePath - The relative path within baseDir
   * @param {string} filename - The filename to write
   * @param {Object} options - Stream options
   * @param {boolean} [options.compareOnClose] - When true, compare temp with existing file on close
   *   and skip the rename if they are byte-identical
   * @returns {Object} - Stream info object (without promise, streamKey)
   * @protected
   */
  _openStream(relativePath, filename, options = {}) {
    console.verbose('openStream', relativePath, filename);

    // Final destination
    const finalDir = path.join(this.options.baseDir, relativePath);
    const finalFilepath = path.join(finalDir, filename);

    // Record original file's mtime if replacing an existing file
    let originalMtime = null;
    try {
      const stat = fs.statSync(finalFilepath);
      originalMtime = stat.mtimeMs;
    } catch (err) {
      // File doesn't exist yet, that's fine
    }

    // Temp directory: studies/<studyUID>/temp/ or studies/temp/
    const tempRelPath = getTempRelativePath(relativePath);
    const tempDir = path.join(this.options.baseDir, tempRelPath);

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Use a unique temp filename to avoid collisions between concurrent writers
    // Sanitize filename: replace path separators so e.g. "instances/index.json.gz" doesn't create subdirs
    const safeFilename = filename.replace(/[\\/]/g, '-');
    const tempFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeFilename}`;
    const tempFilepath = path.join(tempDir, tempFilename);
    const fileStream = fs.createWriteStream(tempFilepath);

    const streamInfo = {
      stream: fileStream,
      fileStream,
      filepath: finalFilepath,
      tempFilepath,
      finalDir,
      filename,
      relativePath,
      originalMtime,
      compareOnClose: options.compareOnClose ?? false,
      contentType: options.contentType || 'application/octet-stream',
      ...options,
    };

    return streamInfo;
  }

  /**
   * Closes a stream and moves the temp file to its final destination.
   * When compareOnClose is enabled, skips rename if files are identical.
   * Sets streamInfo.writeStatus to one of: 'identical', 'created', 'updated', 'updated-stale'.
   * @param {string} streamKey - The key identifying the stream
   * @returns {Promise<string|undefined>} - Resolves with the relative path on success
   */
  async closeStream(streamKey) {
    const streamInfo = this.openStreams.get(streamKey);
    const result = await super.closeStream(streamKey);

    if (result && streamInfo && streamInfo.tempFilepath) {
      this._moveTempToFinal(streamInfo);
    }

    return result;
  }

  /**
   * Moves a temp file to its final destination, warning if the original was modified.
   * When compareOnClose is set, compares first and skips if identical.
   * Sets streamInfo.writeStatus.
   * @param {Object} streamInfo - The stream info
   * @private
   */
  _moveTempToFinal(streamInfo) {
    const { tempFilepath, filepath, finalDir, originalMtime, compareOnClose } = streamInfo;

    try {
      // Check the current state of the destination file
      let currentMtime = null;
      try {
        currentMtime = fs.statSync(filepath).mtimeMs;
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          console.warn(`[FileDicomWebWriter] Could not stat ${filepath}:`, err?.message || err);
        }
      }

      // Detect if the destination changed since we opened:
      // - File existed at open and its mtime changed
      // - File didn't exist at open but now it does (another writer created it)
      const destinationChanged =
        (originalMtime !== null && currentMtime !== null && currentMtime !== originalMtime) ||
        (originalMtime === null && currentMtime !== null);

      // If compareOnClose is enabled and a destination file exists, check identity
      if (compareOnClose && currentMtime !== null) {
        if (filesAreIdentical(tempFilepath, filepath)) {
          streamInfo.writeStatus = 'identical';
          this._cleanupTempFile(tempFilepath);
          return;
        }
      }

      // Log warning if destination was modified by another writer
      if (destinationChanged && originalMtime !== null) {
        console.warn(
          `[FileDicomWebWriter] WARNING: File ${filepath} was modified by another writer ` +
            `since we started (original mtime: ${new Date(originalMtime).toISOString()}, ` +
            `current mtime: ${new Date(currentMtime).toISOString()}). Overwriting.`
        );
      } else if (destinationChanged && originalMtime === null) {
        console.warn(
          `[FileDicomWebWriter] WARNING: File ${filepath} was created by another writer ` +
            `since we started. Overwriting.`
        );
      }

      // Set writeStatus
      if (destinationChanged) {
        streamInfo.writeStatus = 'updated-stale';
      } else if (originalMtime === null) {
        streamInfo.writeStatus = 'created';
      } else {
        streamInfo.writeStatus = 'updated';
      }

      // Ensure the final directory exists (it may have been cleaned up, or filename
      // may contain path components like "instances/index.json.gz")
      const targetDir = path.dirname(filepath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Move temp file to final destination
      fs.renameSync(tempFilepath, filepath);
    } catch (err) {
      console.warn(
        `[FileDicomWebWriter] Failed to move temp file ${tempFilepath} to ${filepath}:`,
        err?.message || err
      );
      // Attempt cleanup of temp file
      this._cleanupTempFile(tempFilepath);
      throw err;
    }
  }

  /**
   * Records a stream error and cleans up the associated temp file.
   * @param {string} streamKey - The key identifying the stream
   * @param {Error} error - The error that occurred
   * @param {boolean} skipPromiseReject - If true, don't reject the promise
   */
  recordStreamError(streamKey, error, skipPromiseReject = false) {
    const streamInfo = this.openStreams.get(streamKey);
    const tempFilepath = streamInfo?.tempFilepath;

    super.recordStreamError(streamKey, error, skipPromiseReject);

    // Clean up temp file after the stream has been destroyed
    if (tempFilepath) {
      this._cleanupTempFile(tempFilepath);
    }
  }

  /**
   * Removes a temp file, ignoring ENOENT.
   * @param {string} tempFilepath - Path to the temp file
   * @private
   */
  _cleanupTempFile(tempFilepath) {
    try {
      fs.unlinkSync(tempFilepath);
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        console.warn(
          `[FileDicomWebWriter] Could not clean up temp file ${tempFilepath}:`,
          err?.message || err
        );
      }
    }
  }
}
