// CommonJS, so that the CommonJS dirScanner can require it: bun rejects a require() of an .mjs file.

/**
 * Codes of a file system error that mean that the path does not exist. No stored path has a
 * name that is too long, so `ENAMETOOLONG` (for example a long UID in a request) is missing.
 */
const MISSING_PATH_CODES = new Set(['ENOENT', 'ENOTDIR', 'ENAMETOOLONG']);

/**
 * Returns true when a file system error means that the path does not exist (`ENOENT`,
 * `ENOTDIR`, `ENAMETOOLONG`): a missing path. Compare isCorruptFileError and toStorageError.
 * @param {Error} error
 * @returns {boolean}
 */
const isMissingPathError = error => MISSING_PATH_CODES.has(error?.code);

module.exports = isMissingPathError;
