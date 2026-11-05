/* global awslambda */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { handle } from '../handle.mjs';
import { loadConfig, createContext } from '../context.mjs';
import { s3Store } from '../stores/s3.mjs';

const config = loadConfig();
const context = createContext({
  config,
  store: s3Store({ bucket: config.bucket, prefix: config.root.replace(/^\//, '') }),
});

/** The request of a Lambda function URL event (payload format 2.0). */
function eventToRequest({ rawPath, rawQueryString, headers, requestContext }) {
  const query = rawQueryString ? `?${rawQueryString}` : '';
  return new Request(`https://${headers.host}${rawPath}${query}`, {
    method: requestContext.http.method,
    headers,
  });
}

/**
 * The Lambda function URL entry (PRX-IMP-28), with response streaming: event to `Request`,
 * `handle`, then the `Response` to the response stream.
 */
export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const response = await handle(eventToRequest(event), context);
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
  });
  if (response.body) {
    await pipeline(Readable.fromWeb(response.body), stream);
  } else {
    stream.end();
  }
});
