/** Codes of a file system error that mean that the path does not exist */
const MISSING_PATH_CODES = new Set(['ENOENT', 'ENOTDIR']);

/**
 * Returns true when a file system error means that the path does not exist (`ENOENT`,
 * `ENOTDIR`): a missing path. Compare isCorruptFileError and toStorageError.
 * @param {Error} error
 * @returns {boolean}
 */
export function isMissingPathError(error) {
  return MISSING_PATH_CODES.has(error?.code);
}

/**
 * Returns true when a read error shows that the file content is corrupt: the gunzip
 * step failed (zlib codes start with `Z_`), or the JSON parse failed.
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
 * Error of a build when the storage cannot read or list stored data (an I/O error). A
 * server answers it with `503 Service Unavailable` and a `Retry-After` header of
 * `retryAfterSeconds`. `code` is the code of the file system error, and `cause` the error.
 */
export class StorageUnavailableError extends Error {
  constructor(path, cause) {
    super(`Cannot read ${path}: ${cause?.code || cause?.message || cause}`, { cause });
    this.name = 'StorageUnavailableError';
    this.code = cause?.code;
    this.path = path;
    this.retryAfterSeconds = 10;
  }
}

/**
 * Classifies an error of a read, an existence check or a listing of `path`. A missing path
 * and a corrupt file give the error back unchanged. Any other error is an I/O error (for
 * example `ESTALE`, `EIO` or `EACCES`): the path can exist, but the storage cannot read it
 * now, so this returns a StorageUnavailableError.
 * @param {string} path
 * @param {Error} error
 * @returns {Error}
 */
export function toStorageError(path, error) {
  if (isMissingPathError(error) || isCorruptFileError(error)) {
    return error;
  }
  return error instanceof StorageUnavailableError
    ? error
    : new StorageUnavailableError(path, error);
}
