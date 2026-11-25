import fs from 'node:fs';

/**
 * The code of the CloudFront Function (`cloudfront-js-2.0`) of the edge mapping: `mapRequest`
 * with the deployment options in place of OPTIONS, and a `handler(event)` that applies it.
 * @param {{root: string, variants: string[], collectionParameter: ?string}} options
 * @returns {string} The function code, for the CloudFront API
 */
export function buildCloudFrontFunction(options) {
  const source = fs
    .readFileSync(new URL('./mapRequest.mjs', import.meta.url), 'utf8')
    .replace(/^export .*$/m, '')
    .replace(/^var OPTIONS = .*$/m, `var OPTIONS = ${JSON.stringify(options)};`);
  return `${source}
function handler(event) {
  if (event.request.method === 'OPTIONS') {
    // CORS preflight: neither the storage nor the proxy answers OPTIONS.
    return {
      statusCode: 204,
      headers: {
        'access-control-allow-origin': { value: '*' },
        'access-control-allow-methods': { value: 'GET, HEAD, OPTIONS' },
        'access-control-allow-headers': { value: '*' },
        'access-control-max-age': { value: '86400' },
      },
    };
  }
  var mapped = mapRequest(event.request);
  event.request.uri = mapped.uri;
  event.request.querystring = mapped.querystring;
  return event.request;
}
`;
}

export default buildCloudFrontFunction;
