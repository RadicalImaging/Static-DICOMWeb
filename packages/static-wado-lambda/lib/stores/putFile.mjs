import {
  fileToKey,
  fileToContentType,
  fileToContentEncoding,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';

/**
 * Writes a file of the local DICOMweb layout (for example `studies/<uid>/index.json.gz`) to a
 * store, with the key, content type, and content encoding of the storage format (PRX-IMP-10).
 * @param {{put: Function}} store
 * @param {string} file - File name relative to the DICOMweb root
 * @param {Uint8Array|string} body - The file content, already compressed for a `.gz` name
 */
export function putFile(store, file, body) {
  return store.put(fileToKey(file), body, {
    contentType: fileToContentType(file),
    contentEncoding: fileToContentEncoding(file),
  });
}

export default putFile;
