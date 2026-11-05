import http from 'node:http';
import { Readable } from 'node:stream';
import { handle } from './handle.mjs';

/**
 * The stored object of a GET with no query string, as the S3 origin serves it, or undefined.
 * shortcut: no edge mapping of the request; add `mapRequest` when it exists.
 */
async function serveStored(request, { config, store }) {
  const { pathname, search } = new URL(request.url);
  const prefix = `${config.root}/`;
  if (request.method !== 'GET' || search || !pathname.startsWith(prefix)) {
    return undefined;
  }
  const stored = await store.get(pathname.slice(prefix.length));
  if (!stored) {
    return undefined;
  }
  const headers = { 'Content-Type': stored.contentType };
  if (stored.contentEncoding) {
    headers['Content-Encoding'] = stored.contentEncoding;
  }
  return new Response(stored.body, { headers });
}

/**
 * A Node HTTP server that acts as the deployment (PRX-IMP-1): the store first, as the S3
 * origin, and `handle` on a miss, as the Lambda failover origin.
 * @param {Object} context - From `createContext`, usually with the directory store
 * @returns {http.Server} Not yet listening
 */
export function createLocalServer(context) {
  return http.createServer(async (req, res) => {
    try {
      const request = new Request(new URL(req.url, `http://${req.headers.host}`), {
        method: req.method,
        headers: req.headers,
      });
      const response = (await serveStored(request, context)) || (await handle(request, context));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        Readable.fromWeb(response.body).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      console.error('Local server failure', req.url, error);
      res.writeHead(500).end();
    }
  });
}

export default createLocalServer;
