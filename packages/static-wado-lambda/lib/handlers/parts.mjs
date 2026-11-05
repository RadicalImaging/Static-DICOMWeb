import { gzipSync } from 'node:zlib';
import { wrapMultipart } from '@radicalimaging/static-wado-util/storageFormat/index.mjs';

/**
 * The first part of an upstream multipart response, read into memory. The other parts are not
 * read. `transferSyntaxUid` is the `transfer-syntax` parameter of the part, or undefined.
 * shortcut: the part is buffered (frames, bulkdata, and Part 10 up to the upstream limit of
 * about 32 MB); stream with a tee when larger objects must pass.
 * @param {AsyncIterable<{headers: Headers, body: ReadableStream}>} parts
 * @returns {Promise<{body: Buffer, contentType: string, transferSyntaxUid?: string}>}
 */
export async function firstPart(parts) {
  for await (const { headers, body } of parts) {
    const type = headers.get('content-type') || 'application/octet-stream';
    return {
      contentType: type.split(';')[0].trim(),
      transferSyntaxUid: /transfer-syntax=\s*"?([^;"\s]+)/i.exec(type)?.[1],
      body: Buffer.from(await new Response(body).arrayBuffer()),
    };
  }
  throw new Error('The upstream response has no part');
}

/**
 * Stores parts as one multipart/related object.
 * @param {Object} store
 * @param {string} key
 * @param {Object[]} parts - See `wrapMultipart`
 * @param {'gzip'} [contentEncoding]
 * @returns {Promise<{body: Buffer, contentType: string, contentEncoding?: string}>} The stored
 *   object, for `storedResponse`
 */
export async function storeParts(store, key, parts, contentEncoding) {
  const wrapped = wrapMultipart(parts);
  const body = contentEncoding ? gzipSync(wrapped.body) : wrapped.body;
  await store.put(key, body, { contentType: wrapped.contentType, contentEncoding });
  return { body, contentType: wrapped.contentType, contentEncoding };
}

/**
 * The response of a stored object, the same bytes and headers as the storage gives
 * (PRX-USR-14).
 */
export function storedResponse({ body, contentType, contentEncoding }) {
  const headers = { 'Content-Type': contentType };
  if (contentEncoding) {
    headers['Content-Encoding'] = contentEncoding;
  }
  return new Response(body, { headers });
}
