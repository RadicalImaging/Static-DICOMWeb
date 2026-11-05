import { gzipSync } from 'node:zlib';
import {
  fileToContentType,
  fileToContentEncoding,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import { putFile } from '../stores/putFile.mjs';

/** The number of parallel writes of one request (PRX-IMP-27) */
const WRITE_LIMIT = 8;

/**
 * Gzips and stores JSON files of the local layout, with at most `WRITE_LIMIT` writes in
 * parallel. Returns the stored bytes of the first file, with the headers that the storage
 * gives, so that the first answer and a later stored answer are the same bytes (PRX-USR-14).
 * @param {Object} store
 * @param {[string, Object][]} files - `[file name, JSON value]`; file names end in `.gz`
 * @returns {Promise<Response>} The response for the first file
 */
export async function storeJson(store, files) {
  const bodies = files.map(([file, json]) => [file, gzipSync(JSON.stringify(json))]);
  let next = 0;
  const writer = async () => {
    while (next < bodies.length) {
      const [file, body] = bodies[next++];
      await putFile(store, file, body);
    }
  };
  await Promise.all(Array.from({ length: Math.min(WRITE_LIMIT, bodies.length) }, writer));
  const [file, body] = bodies[0];
  return new Response(body, {
    headers: {
      'Content-Type': fileToContentType(file),
      'Content-Encoding': fileToContentEncoding(file),
    },
  });
}

export default storeJson;
