import { DicomWebFetchError } from '@dcmjs-org/commands/dicomweb-fetch';
import { route } from './router.mjs';
import handlers from './handlers/index.mjs';

/**
 * The error response for a status (PRX-IMP-25). CloudFront keeps a 404 for 5 minutes, and
 * every other error for 10 seconds, so that an upstream auth fault (401, 403) clears quickly.
 * A 429 is logged with the request key.
 * @param {{status?: number, retryAfter?: string}} error - Default status 500
 * @param {string} [key] - The request path, for the log
 * @returns {Response} A response with no body
 */
export function errorResponse({ status = 500, retryAfter } = {}, key) {
  if (status === 429) {
    console.warn('Upstream 429', key);
  }
  const headers = { 'Cache-Control': `max-age=${status === 404 ? 300 : 10}` };
  if (retryAfter) {
    headers['Retry-After'] = retryAfter;
  }
  return new Response(null, { status, headers });
}

/**
 * The proxy entry for a request that missed the storage: route, allowlist check, dispatch to
 * the handler table, and error mapping. No request can write data (no STOW-RS).
 * @param {Request} request
 * @param {{config: Object, store: Object, upstream: Object, secrets?: Object, compute?: Object}} context
 * @returns {Promise<Response>}
 */
export async function handle(request, context) {
  const { pathname, searchParams } = new URL(request.url);
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse({ status: 405 });
    }
    const prefix = `${context.config.root}/`;
    const found = pathname.startsWith(prefix) && route(pathname.slice(prefix.length), searchParams);
    const handler = found && handlers[found.kind];
    if (!handler) {
      return errorResponse({ status: 404 });
    }
    if (found.studyUID && !(await context.upstream.isAllowed(found.studyUID))) {
      return errorResponse({ status: 403 });
    }
    return await handler(found, request, context);
  } catch (error) {
    if (error instanceof DicomWebFetchError) {
      return errorResponse(error, pathname);
    }
    console.error('Proxy failure', pathname, error);
    return errorResponse({ status: 500 });
  }
}

export default handle;
