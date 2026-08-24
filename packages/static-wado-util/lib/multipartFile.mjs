import fs from 'fs';
import zlib from 'zlib';

/** Longest boundary accepted when sniffing for a multipart delimiter line */
const MAX_BOUNDARY_LENGTH = 200;
/** A boundary delimiter line followed by a MIME header name */
const multipartStartRe = new RegExp(
  `^--[^\\r\\n]{1,${MAX_BOUNDARY_LENGTH}}\\r\\n[A-Za-z][A-Za-z0-9-]*:`
);
/** Leading bytes read when sniffing a file */
const SNIFF_BYTES = 1024;

/**
 * Returns true when the leading bytes are the start of a multipart body: a boundary
 * delimiter line followed by a MIME header, as every multipart file this project writes
 * has ("--<boundary>\r\nContent-Type: ...").
 *
 * A bare leading "--" is deliberately not enough. Bulkdata and frames are stored under
 * extension-less keys as well, and binary content that happens to begin with those two
 * bytes would otherwise be taken for multipart.
 * @param {Buffer} bytes - Leading bytes of the file
 * @returns {boolean}
 */
export function looksMultipart(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0x2d || bytes[1] !== 0x2d) return false;
  return multipartStartRe.test(bytes.subarray(0, MAX_BOUNDARY_LENGTH + 64).toString('latin1'));
}

/**
 * Reads the leading bytes of a file, returning an empty buffer if it cannot be read.
 * @param {string} filePath - File to read
 * @param {number} [length] - Bytes to read
 * @returns {Buffer}
 */
function readLeadingBytes(filePath, length = SNIFF_BYTES) {
  const header = Buffer.alloc(length);
  let bytesRead = 0;
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    bytesRead = fs.readSync(fd, header, 0, length, 0);
  } catch {
    return Buffer.alloc(0);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return header.subarray(0, bytesRead);
}

/**
 * Renames a multipart file stored under a plain ".gz" name to <base>.mht or
 * <base>.mht.gz according to its content. Files that are not multipart (gzipped JSON
 * such as metadata.gz, raw bulkdata) are left alone.
 *
 * The stripped ".mht" extension cannot be recovered from an object listing, so a
 * retrieve has to guess "<key>.gz"; this puts a file left under that guess at the name
 * the rest of the system looks for.
 * @param {string} existingPath - Full path of the file stored under the guessed name
 * @returns {string|undefined} The corrected path, if renamed
 */
export function renameLegacyMultipart(existingPath) {
  const header = readLeadingBytes(existingPath);
  if (header.length < 2) return undefined;

  let base = existingPath.substring(0, existingPath.length - 3);
  if (base.endsWith('.json')) {
    // A directory-index guess (index.json.gz) holding multipart content
    // belongs at index.mht(.gz)
    base = base.substring(0, base.length - '.json'.length);
  }

  let corrected;
  if (looksMultipart(header)) {
    // An uncompressed .mht stored as .gz
    corrected = `${base}.mht`;
  } else if (header[0] === 0x1f && header[1] === 0x8b) {
    // Gzip data - only rename when the compressed content is multipart
    try {
      const inflated = zlib.gunzipSync(header, {
        finishFlush: zlib.constants.Z_SYNC_FLUSH,
      });
      if (looksMultipart(inflated)) {
        corrected = `${base}.mht.gz`;
      }
    } catch (e) {
      console.verbose?.('Unable to inspect gzip content of', existingPath, e.message);
    }
  }

  if (!corrected || fs.existsSync(corrected)) return undefined;
  fs.renameSync(existingPath, corrected);
  console.noQuiet?.('Renamed', existingPath, 'to', corrected);
  return corrected;
}
