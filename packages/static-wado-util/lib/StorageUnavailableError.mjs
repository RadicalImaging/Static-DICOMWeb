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
    super(`Storage error on ${path}: ${cause?.code || cause?.message || cause}`, { cause });
    this.name = 'StorageUnavailableError';
    this.code = cause?.code;
    this.path = path;
    this.retryAfterSeconds = 10;
  }
}

/**
 * Returns true for an I/O error: a file system error with an errno code (for example
 * `ESTALE`, `EIO`, `EACCES`, `ENOSPC`) that is not a missing path. A corrupt file, a Node.js
 * error (`ERR_*`, for example a string that is too long) and an error with no code are not
 * I/O errors, because a retry after the storage recovers does not change them.
 * @param {Error} error
 * @returns {boolean}
 */
function isIoError(error) {
  const code = error?.code;
  return (
    typeof code === 'string' &&
    !isMissingPathError(error) &&
    !isCorruptFileError(error) &&
    !code.startsWith('ERR_')
  );
}

/**
 * Classifies an error of a read, an existence check, a listing or a write of `path`. For an
 * I/O error (isIoError), the path can exist, but the storage cannot read or write it now, so
 * this returns a StorageUnavailableError. Any other error comes back unchanged.
 * @param {string} path
 * @param {Error} error
 * @returns {Error}
 */
export function toStorageError(path, error) {
  if (error instanceof StorageUnavailableError || !isIoError(error)) {
    return error;
  }
  return new StorageUnavailableError(path, error);
}
