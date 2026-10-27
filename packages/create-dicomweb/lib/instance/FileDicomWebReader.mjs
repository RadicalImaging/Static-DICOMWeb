import fs from 'fs';
import path from 'path';
import { createGunzip } from 'zlib';
import { DicomWebReader } from './DicomWebReader.mjs';

/**
 * Returns true when a read error shows that the file content is corrupt: the gunzip
 * step failed (zlib codes start with `Z_`), or the JSON parse failed. An I/O error
 * such as `ESTALE`, `EIO` or `ENOENT` returns false, because the file can be correct,
 * for example when a read overlaps a rename on a network file system.
 * @param {Error} error - The error of the read
 * @returns {boolean}
 */
export function isCorruptFileError(error) {
  if (!error) {
    return false;
  }
  if (typeof error.code === 'string' && error.code.startsWith('Z_')) {
    return true;
  }
  return error instanceof SyntaxError || error.cause instanceof SyntaxError;
}

/**
 * File-based implementation of DicomWebReader
 * Provides file system operations for reading DICOMweb files
 */
export class FileDicomWebReader extends DicomWebReader {
  /**
   * @param {string} baseDir - Base directory for DICOMweb structure
   */
  constructor(baseDir) {
    super(baseDir);
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
   * @returns {Object} - { exists: boolean, path: string, isCompressed: boolean }
   */
  fileExists(relativePath, filename) {
    const fullPath = this._getFullPath(relativePath, filename);
    
    if( filename==='index.json' && relativePath.endsWith('/metadata') ) {
      const immediateMetadataExists = this.fileExists(relativePath.substring(0,relativePath.length-9), 'metadata.json');
      if( immediateMetadataExists ) {
        return immediateMetadataExists;
      }
    }

    // Check uncompressed file first (must be a regular file, not a directory)
    let isDirectory = false;
    if (fs.existsSync(fullPath)) {
      try {
        const stat = fs.lstatSync(fullPath);
        if (stat.isFile()) {
          return { exists: true, path: fullPath, isCompressed: false };
        }
        isDirectory = stat.isDirectory();
      } catch {
        // stat failed, skip
      }
    }

    // Check compressed version
    const compressedPath = `${fullPath}.gz`;
    if (fs.existsSync(compressedPath)) {
      return { exists: true, path: compressedPath, isCompressed: true };
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
      readStream.on('error', (err) => {
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
   * Reads a JSON file, and returns undefined on any read error.
   * With `deleteFileOnError`, deletes the file only when it is corrupt (see
   * isCorruptFileError). An I/O error never deletes the file, because a correct
   * file can give a transient I/O error, for example `ESTALE` on a network file system.
   * With `throwOnIoError`, an I/O error other than `ENOENT` is thrown, so that a build
   * fails instead of treating a correct but unreadable file as missing data (SQR-D3).
   * `ENOENT` still returns undefined, because an upload can delete a file during a build.
   * @param {string} relativePath - Relative path within baseDir
   * @param {string} filename - Filename to read
   * @param {Object} [options] - Options
   * @param {boolean} [options.deleteFileOnError=false] - If true, delete the file (or .gz) after a gunzip or parse error
   * @param {boolean} [options.throwOnIoError=false] - If true, throw an I/O error other than ENOENT
   * @returns {Promise<Object|undefined>} - Parsed JSON, or undefined if missing or on error
   */
  async readJsonFile(relativePath, filename, options = {}) {
    const fileInfo = this.fileExists(relativePath, filename);
    if (!fileInfo) {
      return undefined;
    }
    try {
      return await super.readJsonFile(relativePath, filename, options);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        // An upload can delete a derived file between the check and the read
        console.verbose(`Could not read ${fileInfo.path}: ENOENT`);
      } else if (!isCorruptFileError(error)) {
        if (options.throwOnIoError) {
          throw error;
        }
        console.warn(`Could not read ${fileInfo.path}, keeping it: ${error.code || error.message}`);
      } else if (options.deleteFileOnError) {
        try {
          await fs.promises.unlink(fileInfo.path);
          console.noQuiet(`Deleted corrupted file ${fileInfo.path}: ${error.message}`);
        } catch (unlinkErr) {
          console.warn(`Failed to delete corrupted file ${fileInfo.path}: ${unlinkErr.message}`);
        }
      }
      return undefined;
    }
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
    
    if (!fs.existsSync(fullPath)) {
      return [];
    }

    const stats = fs.lstatSync(fullPath);
    if (!stats.isDirectory()) {
      return [];
    }

    const { withFileTypes = false, recursive = false } = options;
    
    if (withFileTypes) {
      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
      
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
      const names = await fs.promises.readdir(fullPath);
      
      if (recursive) {
        const result = [];
        for (const name of names) {
          result.push(name);
          const subPath = path.join(relativePath, name);
          const subFullPath = this._getFullPath(subPath);
          if (fs.existsSync(subFullPath) && fs.lstatSync(subFullPath).isDirectory()) {
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
