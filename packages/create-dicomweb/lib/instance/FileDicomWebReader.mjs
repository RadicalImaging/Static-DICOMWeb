import fs from 'fs';
import path from 'path';
import { createGunzip } from 'zlib';
import {
  isMissingPathError,
  isCorruptFileError,
  toStorageError,
} from '@radicalimaging/static-wado-util';
import { DicomWebReader } from './DicomWebReader.mjs';

/**
 * Creates the reader of a build: a missing path and a corrupt file count as missing, an I/O
 * error throws a StorageUnavailableError, and any other error throws as it is (see the
 * `throwOnIoError` option). Each build, and each `ensure*` check, uses this reader (SQR-D3).
 * @param {string} baseDir - Base directory for DICOMweb structure
 * @returns {FileDicomWebReader}
 */
export function createBuildReader(baseDir) {
  return new FileDicomWebReader(baseDir, { throwOnIoError: true });
}

/**
 * File-based implementation of DicomWebReader
 * Provides file system operations for reading DICOMweb files
 */
export class FileDicomWebReader extends DicomWebReader {
  /**
   * @param {string} baseDir - Base directory for DICOMweb structure
   * @param {Object} [options]
   * @param {boolean} [options.throwOnIoError=false] - When an existence check, a directory
   *   listing or a read fails with an error that is not a missing path and not a corrupt file,
   *   throw: a StorageUnavailableError for an I/O error (toStorageError), and any other error
   *   as it is. A build uses this, so that a file that it cannot read never counts as missing
   *   data (SQR-D3). Without it, such an error of an existence check or a read counts as
   *   missing (a listing of a directory that the check cannot see gives []), and an error of
   *   the listing itself is thrown as it is.
   */
  constructor(baseDir, options = {}) {
    super(baseDir);
    this.throwOnIoError = options.throwOnIoError === true;
  }

  /**
   * Returns the stat of a path (following links), or undefined when it does not exist. Any
   * other error throws with `throwOnIoError` (_throwIoError), and returns undefined otherwise.
   * @param {string} fullPath
   * @param {Object} [options]
   * @param {boolean} [options.lstat=false] - Do not follow a symbolic link
   * @returns {fs.Stats|undefined}
   * @private
   */
  _stat(fullPath, { lstat = false } = {}) {
    try {
      return lstat ? fs.lstatSync(fullPath) : fs.statSync(fullPath);
    } catch (error) {
      this._throwIoError(fullPath, error);
      return undefined;
    }
  }

  /**
   * With `throwOnIoError`, throws each error that is not a missing path and not a corrupt
   * file: a StorageUnavailableError for an I/O error (toStorageError), and any other error
   * as it is. Thus a build never counts an unreadable file as missing data. Returns for a
   * missing path or a corrupt file, and for any error without `throwOnIoError`.
   * @private
   */
  _throwIoError(fullPath, error) {
    if (!this.throwOnIoError || isMissingPathError(error) || isCorruptFileError(error)) {
      return;
    }
    throw toStorageError(fullPath, error);
  }

  /**
   * Creates a full file path from a relative path
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} [filename] - Optional filename to append
   * @returns {string} - Full file path
   * @private
   */
  _getFullPath(relativePath, filename = '') {
    const fullPath = filename
      ? path.join(this.baseDir, relativePath, filename)
      : path.join(this.baseDir, relativePath);
    return fullPath;
  }

  /**
   * Checks if a file exists (checks both compressed and uncompressed versions)
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to check
   * @returns {Object|false} - { exists: boolean, path: string, isCompressed: boolean }, or false
   * @throws {StorageUnavailableError} - With `throwOnIoError`, when a check has an I/O error
   */
  fileExists(relativePath, filename) {
    const fullPath = this._getFullPath(relativePath, filename);

    if (filename === 'index.json' && relativePath.endsWith('/metadata')) {
      const immediateMetadataExists = this.fileExists(
        relativePath.substring(0, relativePath.length - 9),
        'metadata.json'
      );
      if (immediateMetadataExists) {
        return immediateMetadataExists;
      }
    }

    // Check uncompressed file first (must be a regular file, not a directory)
    const stat = this._stat(fullPath, { lstat: true });
    if (stat?.isFile()) {
      return { exists: true, path: fullPath, isCompressed: false };
    }
    const isDirectory = Boolean(stat?.isDirectory());

    // Check compressed version
    const compressedPath = `${fullPath}.gz`;
    const compressedStat = this._stat(compressedPath);
    if (compressedStat?.isFile()) {
      return { exists: true, path: compressedPath, isCompressed: true };
    }
    // Older layout with a compressed name: metadata.gz/index.json(.gz). Only `metadata` has this
    // layout, and only `metadata` has the cleanup of the writer (isStaleMetadataDirSync)
    if (compressedStat?.isDirectory() && filename === 'metadata') {
      return this.fileExists(`${relativePath}/${filename}.gz`, 'index.json');
    }

    // Older layout: <name>/index.json(.gz) instead of <name>(.gz), e.g. instances/<sop>/metadata/index.json.gz
    if (isDirectory && filename !== 'index.json') {
      return this.fileExists(`${relativePath}/${filename}`, 'index.json');
    }

    return false;
  }

  /**
   * Protected method to open an input stream to an uncompressed file
   * Automatically handles gzip decompression if the file is compressed
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to read
   * @returns {Promise<Readable|undefined>} - Readable stream (uncompressed) or undefined if file doesn't exist
   * @protected
   */
  async _openStream(relativePath, filename) {
    const fileInfo = this.fileExists(relativePath, filename);

    if (!fileInfo) {
      return undefined;
    }

    const readStream = fs.createReadStream(fileInfo.path);

    // If compressed, pipe through gunzip
    if (fileInfo.isCompressed) {
      const gunzipStream = createGunzip();
      readStream.pipe(gunzipStream);

      // Forward errors from readStream to gunzipStream
      readStream.on('error', err => {
        gunzipStream.destroy(err);
      });

      return gunzipStream;
    }

    return readStream;
  }

  /**
   * Opens an input stream to an uncompressed file
   * Automatically handles gzip decompression if the file is compressed
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to read
   * @returns {Promise<Readable|undefined>} - Readable stream (uncompressed) or undefined if file doesn't exist
   */
  async openInputStream(relativePath, filename) {
    return this._openStream(relativePath, filename);
  }

  /**
   * Reads a JSON file. Returns undefined for a missing path or a corrupt file. Any other error
   * also returns undefined, except with `throwOnIoError` (see the constructor), which throws
   * it (_throwIoError). A missing path never throws, because an upload can delete a derived
   * file during a build.
   * With `deleteFileOnError`, deletes the file only when it is corrupt (see
   * isCorruptFileError). An I/O error never deletes the file, because a correct
   * file can give a transient I/O error, for example `ESTALE` on a network file system.
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to read
   * @param {Object} [options] - Options
   * @param {boolean} [options.deleteFileOnError=false] - If true, delete the file (or .gz) after a gunzip or parse error
   * @param {boolean} [options.throwIfNotDeleted=false] - Throw when the deletion of a corrupt file
   *   fails, for a caller that must not see the same corrupt file again (SQR-D3 rule 4)
   * @returns {Promise<Object|undefined>} - Parsed JSON; undefined when missing or corrupt, or
   *   after any other error without `throwOnIoError`
   */
  async readJsonFile(relativePath, filename, options = {}) {
    const fileInfo = this.fileExists(relativePath, filename);
    if (!fileInfo) {
      return undefined;
    }
    try {
      return await super.readJsonFile(relativePath, filename, options);
    } catch (error) {
      if (isMissingPathError(error)) {
        // An upload can delete a derived file between the check and the read
        console.verbose(`Could not read ${fileInfo.path}: ${error.code}`);
      } else if (!isCorruptFileError(error)) {
        this._throwIoError(fileInfo.path, error);
        console.warn(`Could not read ${fileInfo.path}, keeping it: ${error.code || error.message}`);
      } else if (options.deleteFileOnError) {
        try {
          await fs.promises.unlink(fileInfo.path);
          console.noQuiet(`Deleted corrupted file ${fileInfo.path}: ${error.message}`);
        } catch (unlinkErr) {
          if (options.throwIfNotDeleted && !isMissingPathError(unlinkErr)) {
            throw toStorageError(fileInfo.path, unlinkErr);
          }
          console.warn(`Failed to delete corrupted file ${fileInfo.path}: ${unlinkErr.message}`);
        }
      }
      return undefined;
    }
  }

  /**
   * Returns true when the path is a directory. With `throwOnIoError`, an I/O error throws.
   * @param {string} relativePath - Relative path within baseDir
   * @returns {boolean}
   */
  directoryExists(relativePath) {
    return Boolean(this._stat(this._getFullPath(relativePath), { lstat: true })?.isDirectory());
  }

  /**
   * Returns the names of the subdirectories of a directory (for example the series UIDs of
   * a study), or [] when the directory does not exist.
   * @param {string} relativePath - Relative path to scan
   * @returns {Promise<string[]>}
   */
  async listDirectories(relativePath) {
    const entries = await this.scanDirectory(relativePath, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
  }

  /**
   * Scans a directory and returns its contents
   * @param {string} relativePath - Relative path to scan
   * @param {Object} [options] - Scan options
   * @param {boolean} [options.withFileTypes=false] - Include file type information
   * @param {boolean} [options.recursive=false] - Recursively scan subdirectories
   * @returns {Promise<Array>} - Array of file/directory names or Dirent objects
   */
  async scanDirectory(relativePath, options = {}) {
    const fullPath = this._getFullPath(relativePath);

    if (!this.directoryExists(relativePath)) {
      return [];
    }

    const { withFileTypes = false, recursive = false } = options;
    const readdir = async readdirOptions => {
      try {
        return await fs.promises.readdir(fullPath, readdirOptions);
      } catch (error) {
        this._throwIoError(fullPath, error);
        if (isMissingPathError(error)) {
          return [];
        }
        throw error;
      }
    };

    if (withFileTypes) {
      const entries = await readdir({ withFileTypes: true });

      if (recursive) {
        const result = [];
        for (const entry of entries) {
          result.push(entry);
          if (entry.isDirectory()) {
            const subPath = path.join(relativePath, entry.name);
            const subEntries = await this.scanDirectory(subPath, options);
            result.push(...subEntries);
          }
        }
        return result;
      }

      return entries;
    } else {
      const names = await readdir();

      if (recursive) {
        const result = [];
        for (const name of names) {
          result.push(name);
          const subPath = path.join(relativePath, name);
          if (this.directoryExists(subPath)) {
            const subEntries = await this.scanDirectory(subPath, options);
            result.push(...subEntries.map(subName => path.join(name, subName)));
          }
        }
        return result;
      }

      return names;
    }
  }
}
