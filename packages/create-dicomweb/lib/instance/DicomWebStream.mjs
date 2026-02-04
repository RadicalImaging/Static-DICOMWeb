import { FileDicomWebReader } from './FileDicomWebReader.mjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';
import { MultipartResponseDicomWebWriter } from './MultipartResponseDicomWebWriter.mjs';
import { isDicomDirLocation, dicomDirPathFromLocation } from './dicomDirLocation.mjs';

/**
 * Factory for file-based DICOMweb reader/writer instances from a dicomdir (file) location.
 * Use this to obtain FileDicomWebReader or FileDicomWebWriter without introducing circular
 * dependencies between base classes and file implementations.
 */
export class DicomWebStream {
  /**
   * Returns true if the location is a dicomdir (file-system) path.
   * File locations have no protocol, use file:, or are Windows drive-letter paths (e.g. C:\).
   *
   * @param {string} location - URL or path string
   * @returns {boolean}
   */
  static isDicomDirLocation(location) {
    return isDicomDirLocation(location);
  }

  /**
   * Returns true if the location is a multipart response (multipart:).
   * Use with createWriter and options { response } to stream to an Express response.
   *
   * @param {string} location - URL or path string
   * @returns {boolean}
   */
  static isMultipartLocation(location) {
    return typeof location === 'string' && location.trim().toLowerCase().startsWith('multipart:');
  }

  /**
   * If the location is a dicomdir (file) location, returns a FileDicomWebReader instance;
   * otherwise returns null.
   *
   * @param {string} location - Base directory URL or path (file, file:, or no protocol; not http/https etc.)
   * @returns {import('./FileDicomWebReader.mjs').FileDicomWebReader|null}
   */
  static createReader(location) {
    const baseDir = dicomDirPathFromLocation(location);
    if (baseDir == null) {
      return null;
    }
    return new FileDicomWebReader(baseDir);
  }

  /**
   * Creates a writer from options. Handles the distinction between multipart response and output directory.
   * - If baseDir/outputDir is "multipart:response:" or options.response is set: returns MultipartResponseDicomWebWriter (options.response required for multipart).
   * - Else: returns FileDicomWebWriter with baseDir = options.outputDir ?? options.baseDir ?? '.'.
   *
   * @param {Object} informationProvider - The information provider instance with UIDs
   * @param {Object} options - Options as-is: { response } for multipart; { outputDir } or { baseDir } for file output (use "multipart:response:" for multipart)
   * @returns {import('./FileDicomWebWriter.mjs').FileDicomWebWriter|import('./MultipartResponseDicomWebWriter.mjs').MultipartResponseDicomWebWriter|null}
   */
  static createWriter(informationProvider, options = {}) {
    const opts = options || {};
    const baseDirOrOutput = opts.outputDir ?? opts.baseDir ?? '.';
    const useMultipart =
      baseDirOrOutput === 'multipart:response:' ||
      String(baseDirOrOutput).startsWith('multipart:response:') ||
      opts.response;
    if (useMultipart) {
      if (!opts.response) {
        throw new Error(
          'createWriter with multipart:response: or options.response requires options.response (Express response)'
        );
      }
      return new MultipartResponseDicomWebWriter(informationProvider, opts);
    }
    const resolved = dicomDirPathFromLocation(baseDirOrOutput);
    if (resolved == null) {
      return null;
    }
    return new FileDicomWebWriter(informationProvider, { ...opts, baseDir: resolved });
  }
}
