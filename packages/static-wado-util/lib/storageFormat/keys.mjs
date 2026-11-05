import path from 'path';
import mime from 'mime-types';
import uids from '../uids.mjs';

const compressedRe = /((\.br)|(\.gz))$/;
const indexRe = /\/index\.(json|mht)$/;

const octetStream = 'application/octet-stream';
const multipartRelated = 'multipart/related';
const imagejpeg = 'image/jpeg';
const pngType = 'image/png';
const applicationDicom = 'application/dicom';
const ionType = 'application/x-amzn-ion';

/** Extension to content type for the raw codestreams frames can be stored as */
const codestreamContentTypes = Object.values(uids).reduce((acc, info) => {
  if (info.extension && info.contentType) acc[info.extension] = info.contentType;
  return acc;
}, {});

/** Last path segment of a file name or key; win32 accepts both separators */
const lastSegment = name => path.win32.basename(name);

const hasExtension = name => lastSegment(name).indexOf('.') !== -1;

/**
 * Content type for a frame stored as a raw codestream, from the transfer syntax
 * table's extensions (.jls, .jll, .jxl, .jhc, ...). mime-types knows some of these
 * and not others, so the table is the authority for the ones it misses.
 * @param {string} src - File name without any compression extension
 * @returns {string|undefined}
 */
function codestreamContentType(src) {
  const segment = lastSegment(src);
  const dot = segment.lastIndexOf('.');
  return dot === -1 ? undefined : codestreamContentTypes[segment.substring(dot)];
}

const extensionsToRemove = ['.mht', '.jhc'];

const findExtensionToRemove = name => {
  for (const testExtension of extensionsToRemove) {
    const lastFound = name.lastIndexOf(testExtension);
    if (lastFound !== -1) return lastFound;
  }
};

/**
 * Converts a file name of the local DICOMweb layout into its storage key: strips `.gz` and
 * `.br`, collapses `index.json` / `index.mht` to the directory key, and strips `.mht` and
 * `.jhc`. The key has no leading slash and no deployment path prefix; the root index gives ''.
 * @param {string} file - File name relative to the DICOMweb root, either separator
 * @returns {string} The key relative to the DICOMweb root
 */
export function fileToKey(file) {
  let fileName = file.replaceAll('\\', '/');
  if (compressedRe.test(fileName)) {
    fileName = fileName.substring(0, fileName.length - 3);
  }
  if (fileName[0] != '/') fileName = `/${fileName}`;
  if (indexRe.test(fileName)) {
    fileName = fileName.substring(0, fileName.lastIndexOf('/index'));
  }
  if (fileName[0] == '/') {
    fileName = fileName.substring(1);
  }
  const extensionPos = findExtensionToRemove(fileName);
  if (extensionPos > 0) {
    fileName = fileName.substring(0, extensionPos);
  }
  return fileName;
}

/**
 * The content type that the stored object of a file gets.
 * @param {string} file - File name of the local DICOMweb layout
 * @returns {string}
 */
export function fileToContentType(file) {
  const compressed = compressedRe.test(file);
  const src = (compressed && file.substring(0, file.length - 3)) || file;
  return (
    mime.lookup(src) ||
    codestreamContentType(src) ||
    (src.indexOf('.dcm') !== -1 && applicationDicom) ||
    (src.indexOf('.mht') !== -1 && multipartRelated) ||
    (src.indexOf('bulkdata') !== -1 && octetStream) ||
    (src.indexOf('.raw') !== -1 && octetStream) ||
    // A raw codestream frame (with an extension) is single-part
    (src.indexOf('frames') !== -1 && !hasExtension(src) && multipartRelated) ||
    (src.indexOf('thumbnail') !== -1 && imagejpeg) ||
    (src.indexOf('.ion') !== -1 && ionType) ||
    (src.indexOf('rendered') !== -1 && pngType) ||
    'application/json'
  );
}

/**
 * The content encoding that the stored object of a file gets.
 * @param {string} file - File name of the local DICOMweb layout
 * @returns {'brotli'|'gzip'|undefined}
 */
export function fileToContentEncoding(file) {
  if (file.indexOf('.br') !== -1) return 'brotli';
  if (file.indexOf('.gz') !== -1) return 'gzip';
  return undefined;
}
