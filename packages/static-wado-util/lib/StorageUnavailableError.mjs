import isMissingPathError from './isMissingPathError.js';

export { isMissingPathError };

/**
 * Codes of a file system error that a retry after the storage recovers does not change: the
 * layout of the files or the request is wrong. These are not I/O errors.
 */
const PERMANENT_CODES = new Set(['ELOOP', 'EISDIR', 'EINVAL', 'ENOTEMPTY', 'EEXIST', 'EXDEV']);

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
 * Error of a build when the storage cannot read, list or write data (an I/O error). A
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
 * Returns true for an I/O error: a file system error with an error code of the operating
 * system (`E` and capitals, for example `ESTALE`, `EIO`, `EACCES`, `ENOSPC`) that is not a
 * missing path, and not in PERMANENT_CODES. A corrupt file, a Node.js error (`ERR_*`,
 * `ABORT_ERR`) and an error with no code are not I/O errors, because a retry after the
 * storage recovers does not change them.
 * @param {Error} error
 * @returns {boolean}
 */
function isIoError(error) {
  const code = error?.code ?? '';
  return /^E[A-Z0-9]+$/.test(code) && !isMissingPathError(error) && !PERMANENT_CODES.has(code);
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

/** Codes of an I/O error that mean that the storage or the server has no free space or resources */
const OUT_OF_RESOURCES_CODES = new Set(['ENOSPC', 'EDQUOT', 'EMFILE', 'ENFILE', 'ENOMEM']);

/**
 * Returns true when an error (or the cause of a StorageUnavailableError) means that the
 * storage or the server has no free space or resources (`ENOSPC`, `EDQUOT`, `EMFILE`,
 * `ENFILE`, `ENOMEM`). These are I/O errors (toStorageError), so a retry can succeed.
 * @param {Error} error
 * @returns {boolean}
 */
export function isOutOfResourcesError(error) {
  return OUT_OF_RESOURCES_CODES.has(error?.code ?? error?.cause?.code);
}
