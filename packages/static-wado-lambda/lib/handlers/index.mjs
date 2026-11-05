import { seriesMetadata, instanceMetadata } from './metadata.mjs';
import { studyQuery, seriesQuery, instanceQuery } from './query.mjs';

/**
 * The handler table: route kind (see `router.mjs`) to handler. `handle` returns 404 for a kind
 * with no handler.
 *
 * A handler is `async (route, request, context) => Response`. It runs only on a storage miss,
 * after the allowlist check of `route.studyUID`. It throws the `DicomWebFetchError` of the
 * upstream unchanged; `handle` maps the error to the response (PRX-IMP-25).
 * @type {Object<string, (route: Object, request: Request, context: Object) => Promise<Response>>}
 */
const handlers = {
  seriesMetadata,
  instanceMetadata,
  studyQuery,
  seriesQuery,
  instanceQuery,
};

export default handlers;
