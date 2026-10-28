import fs from 'fs';
import { open } from 'fs/promises';
import path from 'path';
import { DicomWebWriter } from './DicomWebWriter.mjs';
import { isStaleMetadataDirSync, removeStaleMetadataDirSync } from './removeStaleMetadataDir.mjs';

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

/** Name of a temp file of this writer: `<Date.now()>-<random base 36>-<file name>` */
export const TEMP_FILE_NAME_RE = /^\d{13}-[a-z0-9]+-./;

const COMPARE_BLOCK_SIZE = 4096;

/**
 * Compares two files by size then block-by-block without reading entire files into memory.
 * Safe for arbitrarily large files (multi-GB).
 * @param {string} fileA - Path to first file
 * @param {string} fileB - Path to second file
 * @returns {Promise<boolean>} - True if files are byte-identical
 */
async function filesAreIdentical(fileA, fileB) {
  let fdA, fdB;
  try {
    fdA = await open(fileA, 'r');
    fdB = await open(fileB, 'r');

    const [statA, statB] = await Promise.all([fdA.stat(), fdB.stat()]);
    if (statA.size !== statB.size) return false;
    // Zero-length files with same size are identical
    if (statA.size === 0) return true;

    // Capture destination mtime before comparison so we can detect concurrent writes
    const mtimeBefore = statB.mtimeMs;

    const bufA = Buffer.allocUnsafe(COMPARE_BLOCK_SIZE);
    const bufB = Buffer.allocUnsafe(COMPARE_BLOCK_SIZE);
    let offset = 0;

    while (offset < statA.size) {
      const [readA, readB] = await Promise.all([
        fdA.read(bufA, 0, COMPARE_BLOCK_SIZE, offset),
        fdB.read(bufB, 0, COMPARE_BLOCK_SIZE, offset),
      ]);
      if (readA.bytesRead !== readB.bytesRead) return false;
      if (!bufA.subarray(0, readA.bytesRead).equals(bufB.subarray(0, readB.bytesRead))) {
        return false;
      }
      offset += readA.bytesRead;
    }

    // Re-stat destination to ensure it was not modified during the comparison
    const statBAfter = await fdB.stat();
    if (statBAfter?.mtimeMs !== mtimeBefore) return false;

    return true;
  } catch {
    return false;
  } finally {
    await fdA?.close().catch(() => {});
    await fdB?.close().catch(() => {});
  }
}

/**
 * Write status values set on streamInfo.writeStatus after closeStream:
 * - 'identical'      : new file is byte-identical to existing; temp deleted, no rename
 * - 'created'        : new file; no previous version existed
 * - 'updated'        : replaced existing file that had the expected mtime
 * - 'updated-stale'  : replaced existing file whose mtime changed since open (another writer touched it)
 * - 'generation-changed' : options.canCommit() returned false; temp deleted, no rename
 */

/**
 * File-based implementation of DicomWebWriter
 * Writes DICOMweb files to the filesystem using temp files for atomicity.
 * Files are written to a temp directory and moved to their final location on close.
 *
 * When `options.deferFinalMove` is true, closeStream() writes and flushes data to
 * temp files but does NOT rename them to the final location. Instead, stream info
 * is accumulated in `pendingMoves`. Call `commitPendingMoves()` to atomically
 * rename all temp files, or `rollbackPendingMoves()` to discard them.
 * This supports a "validate before commit" pattern where a pluggable
 * `validateInstance` hook runs after all data is written but before files are visible.
 *
 * When `options.canCommit` is set, the writer calls it immediately before the rename (one
 * call for all files of commitPendingMoves), with no `await` between the call and the rename. When it returns false, the writer
 * deletes the temp file and sets writeStatus to 'generation-changed'. Builds of derived
 * files use it to commit only a build of the current generation.
 */
export class FileDicomWebWriter extends DicomWebWriter {
  constructor(informationProvider, options) {
    super(informationProvider, options);
    this.deferFinalMove = options?.deferFinalMove ?? false;
    /** @type {Array<Object>} Stream info objects awaiting final rename */
    this.pendingMoves = [];
  }

  /**
   * Deletes a file and its .gz counterpart if present, and an old-format metadata directory
   * at either path. Ignores ENOENT.
   *
   * Never throws: it logs any other error. An upload calls it after the commit of an
   * instance, so a refused delete must not report the stored instance as failed. The derived
   * file that stays is note 2 of "Safety of each deployment" in
   * docs/specs/derived-data-updates.md.
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to delete (without .gz)
   */
  delete(relativePath, filename) {
    const fullPath = path.join(this.options.baseDir, relativePath, filename);
    for (const p of [fullPath, `${fullPath}.gz`]) {
      try {
        fs.unlinkSync(p);
      } catch (err) {
        if (err?.code === 'ENOENT') continue;
        let error = err;
        try {
          if (removeStaleMetadataDirSync(p)) continue;
        } catch (rmErr) {
          error = rmErr;
        }
        console.warn(`[FileDicomWebWriter] Could not delete ${p}:`, error?.message || error);
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

    // Record original file's mtime if replacing an existing file.
    // Old-format metadata directories are only recorded here; they are removed when the
    // write is committed, so a skipped or failed write leaves the existing metadata readable.
    let originalMtime = null;
    const staleMetadataDirs = [];
    try {
      const stat = fs.statSync(finalFilepath);
      if (stat.isDirectory()) {
        if (!isStaleMetadataDirSync(finalFilepath)) {
          throw new Error(
            `Destination is a directory (not metadata), refusing to delete: ${finalFilepath}`
          );
        }
        staleMetadataDirs.push(finalFilepath);
      } else {
        originalMtime = stat.mtimeMs;
      }
    } catch (err) {
      if (err?.message?.startsWith('Destination is a directory')) throw err;
      // File doesn't exist yet, that's fine
    }

    // If writing a .gz file, also clean up any stale metadata directory at the non-.gz path (old format)
    if (filename.endsWith('.gz')) {
      const nonGzPath = finalFilepath.slice(0, -3);
      if (isStaleMetadataDirSync(nonGzPath)) {
        staleMetadataDirs.push(nonGzPath);
      }
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
    // Open synchronously: an asynchronous open can create the file after a cleanup removed it
    const fileStream = fs.createWriteStream(tempFilepath, { fd: fs.openSync(tempFilepath, 'w') });

    const streamInfo = {
      stream: fileStream,
      fileStream,
      filepath: finalFilepath,
      tempFilepath,
      finalDir,
      filename,
      relativePath,
      originalMtime,
      staleMetadataDirs,
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
      if (this.deferFinalMove) {
        this.pendingMoves.push(streamInfo);
      } else {
        await this._moveTempToFinal(streamInfo);
      }
    }

    return result;
  }

  /**
   * Renames all deferred temp files to their final destinations.
   * Only meaningful when `deferFinalMove` is true. Call after validation passes.
   * Compares all files first, and then renames them in one synchronous step with one
   * `canCommit()` check, so on one node the files commit all together, or not at all.
   * A stream opened with `commitLast: true` (the instance `metadata`) renames after all other
   * files, so a failed rename or a process stop never shows an instance without its frames.
   */
  async commitPendingMoves() {
    const pending = [
      ...this.pendingMoves.filter(streamInfo => !streamInfo.commitLast),
      ...this.pendingMoves.filter(streamInfo => streamInfo.commitLast),
    ];
    this.pendingMoves = [];
    try {
      const moves = [];
      for (const streamInfo of pending) {
        if (await this._prepareMove(streamInfo)) {
          moves.push(streamInfo);
        }
      }
      // No await from here to the last rename
      const commit = this._canCommit();
      for (const streamInfo of moves) {
        this._finishMove(streamInfo, commit);
      }
    } catch (err) {
      // Remove the temp files that did not move; a moved temp file no longer exists
      for (const streamInfo of pending) {
        this._cleanupTempFile(streamInfo.tempFilepath);
      }
      throw err;
    }
  }

  /**
   * Removes all deferred temp files without renaming.
   * Only meaningful when `deferFinalMove` is true. Call when validation fails.
   */
  rollbackPendingMoves() {
    for (const streamInfo of this.pendingMoves) {
      this._cleanupTempFile(streamInfo.tempFilepath);
    }
    this.pendingMoves = [];
  }

  /** @returns {boolean} - false when options.canCommit() refuses the commit */
  _canCommit() {
    return !this.options.canCommit || this.options.canCommit();
  }

  /**
   * Moves a temp file to its final destination, warning if the original was modified.
   * When compareOnClose is set, compares first and skips if identical.
   * Sets streamInfo.writeStatus.
   * @param {Object} streamInfo - The stream info
   * @private
   */
  async _moveTempToFinal(streamInfo) {
    if (await this._prepareMove(streamInfo)) {
      // No await between the check and the rename, so an upload cannot run between them
      this._finishMove(streamInfo, this._canCommit());
    }
  }

  /**
   * First, asynchronous part of a move: when compareOnClose is set and the destination
   * exists, compares the files, and sets writeStatus 'identical' when they are the same.
   * @param {Object} streamInfo - The stream info
   * @returns {Promise<boolean>} - true when the temp file must still be moved
   * @private
   */
  async _prepareMove(streamInfo) {
    const { tempFilepath, filepath, compareOnClose, staleMetadataDirs } = streamInfo;

    // closeStream can run twice for one stream: the filters close without awaiting, and
    // drainOpenStreams finishes any close whose bookkeeping had not run yet. The second rename
    // would fail with ENOENT and report a write failure for a file that was written correctly.
    if (streamInfo._moveStarted) {
      return false;
    }
    streamInfo._moveStarted = true;

    try {
      if (compareOnClose && this._destinationMtime(filepath) !== null) {
        if (await filesAreIdentical(tempFilepath, filepath)) {
          streamInfo.writeStatus = 'identical';
          this._cleanupTempFile(tempFilepath);
          this._removeStaleMetadataDirs(staleMetadataDirs);
          this._removeReplacedFiles(streamInfo);
          return false;
        }
      }
      return true;
    } catch (err) {
      this._cleanupTempFile(tempFilepath);
      throw err;
    }
  }

  /**
   * Second, synchronous part of a move: renames the temp file, or deletes it and sets
   * writeStatus 'generation-changed' when `commit` is false.
   * @param {Object} streamInfo - The stream info
   * @param {boolean} commit - Result of the canCommit() check
   * @private
   */
  _finishMove(streamInfo, commit) {
    const { tempFilepath, filepath, originalMtime, staleMetadataDirs } = streamInfo;

    try {
      if (!commit) {
        streamInfo.writeStatus = 'generation-changed';
        this._cleanupTempFile(tempFilepath);
        return;
      }

      const currentMtime = this._destinationMtime(filepath);

      // Detect if the destination changed since we opened:
      // - File existed at open and its mtime changed
      // - File didn't exist at open but now it does (another writer created it)
      const destinationChanged =
        (originalMtime !== null && currentMtime !== null && currentMtime !== originalMtime) ||
        (originalMtime === null && currentMtime !== null);

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

      // Ensure the final directory exists (it may have been cleaned up, or filename
      // may contain path components like "instances/index.json.gz")
      const targetDir = path.dirname(filepath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // The write is committed: replace the old-format metadata directories
      this._removeStaleMetadataDirs(staleMetadataDirs);

      // Move temp file to final destination
      fs.renameSync(tempFilepath, filepath);

      // Set writeStatus only after the rename, so a failed rename never reports a moved file
      if (destinationChanged) {
        streamInfo.writeStatus = 'updated-stale';
      } else if (originalMtime === null) {
        streamInfo.writeStatus = 'created';
      } else {
        streamInfo.writeStatus = 'updated';
      }
      this._removeReplacedFiles(streamInfo);
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
   * Returns the mtime of the destination file, or null when it does not exist or is a
   * directory (a stale metadata directory is not a file that another writer made).
   * @param {string} filepath
   * @returns {number|null}
   * @private
   */
  _destinationMtime(filepath) {
    try {
      const stat = fs.statSync(filepath);
      return stat.isDirectory() ? null : stat.mtimeMs;
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        console.warn(`[FileDicomWebWriter] Could not stat ${filepath}:`, err?.message || err);
      }
      return null;
    }
  }

  /**
   * Removes the old-format metadata directories that were found when the stream opened.
   * @param {string[]|undefined} staleMetadataDirs
   * @private
   */
  _removeStaleMetadataDirs(staleMetadataDirs) {
    for (const dirPath of staleMetadataDirs || []) {
      if (removeStaleMetadataDirSync(dirPath)) {
        console.noQuiet(`[FileDicomWebWriter] Cleaned up old metadata directory at ${dirPath}`);
      }
    }
  }

  /**
   * Deletes the files that a committed stream replaces (`options.replaces`: file names in the
   * same directory, for example the other variant `1.mht.gz` of a frame `1.mht`). Runs only
   * after the commit, so a failed write keeps them. Never throws.
   * @param {Object} streamInfo
   * @private
   */
  _removeReplacedFiles(streamInfo) {
    for (const name of streamInfo.replaces || []) {
      const replaced = path.join(path.dirname(streamInfo.filepath), name);
      try {
        fs.unlinkSync(replaced);
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          console.warn(`[FileDicomWebWriter] Could not delete ${replaced}:`, err?.message || err);
        }
      }
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
