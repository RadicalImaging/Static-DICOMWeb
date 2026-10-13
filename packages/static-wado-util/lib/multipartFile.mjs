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
 * @returns {Promise<Buffer>}
 */
async function readLeadingBytes(filePath, length = SNIFF_BYTES) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const header = Buffer.alloc(length);
    const { bytesRead } = await handle.read(header, 0, length, 0);
    return header.subarray(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  } finally {
    await handle?.close();
  }
}

/**
 * Renames a multipart file to <base>.mht or <base>.mht.gz according to its content.
 * Files that are not multipart (gzipped JSON such as metadata.gz) are left alone.
 *
 * The caller decides the base name and whether a rename is safe. Content alone cannot
 * tell the two bulkdata layouts apart: both static-wado-creator (<hash>.gz) and
 * create-dicomweb (<hash>.mht.gz) write gzipped multipart bulkdata, and the BulkDataURI
 * in the metadata fixes the name, so bulkdata must never be passed here.
 * @param {string} existingPath - Full path of the file stored under the guessed name
 * @param {string} base - Path without extension that the corrected name is built on
 * @returns {Promise<string|undefined>} The corrected path, if renamed
 */
export async function renameLegacyMultipart(existingPath, base) {
  const header = await readLeadingBytes(existingPath);
  if (header.length < 2) return undefined;

  let corrected;
  if (looksMultipart(header)) {
    corrected = `${base}.mht`;
  } else if (header[0] === 0x1f && header[1] === 0x8b) {
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
  await fs.promises.rename(existingPath, corrected);
  console.noQuiet?.('Renamed', existingPath, 'to', corrected);
  return corrected;
}
