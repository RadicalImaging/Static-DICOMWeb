import { gunzipSync } from 'node:zlib';

/**
 * The body of a stored object before its `Content-Encoding` (PRX-IMP-26): gunzipped for
 * `gzip`, else unchanged. Every read of a stored object for its content uses this, so that
 * an object that `create-dicomweb` wrote gzipped (for example `frames/<n>.mht.gz`) reads the
 * same as one that the proxy wrote.
 * @param {{body: Uint8Array, contentEncoding?: string}} stored - A `store.get` result
 * @returns {Buffer}
 */
export const decodedBody = ({ body, contentEncoding }) =>
  contentEncoding === 'gzip' ? gunzipSync(body) : Buffer.from(body);

/** The JSON value of a stored object, or of a stored `Response` of `storeJson`. */
export async function storedJson(stored) {
  if (stored instanceof Response) {
    return storedJson({
      body: Buffer.from(await stored.arrayBuffer()),
      contentEncoding: stored.headers.get('content-encoding'),
    });
  }
  return JSON.parse(decodedBody(stored).toString());
}

export default decodedBody;
