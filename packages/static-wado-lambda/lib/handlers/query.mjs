import { Tags } from '@radicalimaging/static-wado-util/dictionary/Tags.mjs';
import { errorResponse } from '../handle.mjs';
import { storeJson } from './storeJson.mjs';

const JSON_ACCEPT = 'application/dicom+json, application/json';
const SHORT_CACHE = 'max-age=60';

/** The value of a query key, by keyword or tag and in any case, as the webserver reads it */
function queryValue(query, tag, keyword) {
  for (const [key, value] of query) {
    const lower = key.toLowerCase();
    if (lower === tag || lower === keyword) {
      return value;
    }
  }
  return undefined;
}

/** The records of a QIDO answer that have `uid` in `tag`; the stored index of a UID holds no other */
const withUID = (records, tag, uid) => records.filter(record => Tags.getValue(record, tag) === uid);

/**
 * A query that no stored index answers (Q19): the upstream answer with a short cache time,
 * not stored.
 */
async function passThrough(request, context) {
  const { pathname, search } = new URL(request.url);
  const path = pathname.slice(context.config.root.length + 1);
  const response = await context.upstream.request(`${path}${search}`, JSON_ACCEPT);
  return new Response(response.status === 204 ? null : response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/dicom+json',
      'Cache-Control': SHORT_CACHE,
    },
  });
}

/**
 * Study query (PRX-USR-6). An exact StudyInstanceUID (`studies/<uid>`, or
 * `studies?StudyInstanceUID=<uid>`) gets the upstream study record and stores it as
 * `studies/<uid>/index.json.gz`, the form that `create-dicomweb` writes. Other study queries
 * pass through.
 */
export async function studyQuery(route, request, context) {
  const studyUID = route.studyUID || queryValue(route.query, '0020000d', 'studyinstanceuid');
  if (!studyUID) {
    return passThrough(request, context);
  }
  if (!(await context.upstream.isAllowed(studyUID))) {
    return errorResponse({ status: 403 });
  }
  const studies = withUID(
    await context.upstream.search('studies', { StudyInstanceUID: studyUID }),
    Tags.StudyInstanceUID,
    studyUID
  );
  if (!studies.length) {
    return errorResponse({ status: 404 });
  }
  return storeJson(context.store, [[`studies/${studyUID}/index.json.gz`, studies]]);
}

/**
 * Series query (PRX-USR-6). An exact SeriesInstanceUID (in the path or the query string) gets
 * the upstream series record and stores it as `studies/<s>/series/<x>/series-singleton.json.gz`,
 * the form that `create-dicomweb` writes. With no StudyInstanceUID in the request, the record
 * gives the study; a record with no study passes through. Other series queries pass through.
 */
export async function seriesQuery(route, request, context) {
  const seriesUID = route.seriesUID || queryValue(route.query, '0020000e', 'seriesinstanceuid');
  if (!seriesUID) {
    return passThrough(request, context);
  }
  const requestStudyUID = route.studyUID || queryValue(route.query, '0020000d', 'studyinstanceuid');
  const series = withUID(
    await context.upstream.search(
      requestStudyUID ? `studies/${requestStudyUID}/series` : 'series',
      { SeriesInstanceUID: seriesUID }
    ),
    Tags.SeriesInstanceUID,
    seriesUID
  );
  if (!series.length) {
    return errorResponse({ status: 404 });
  }
  const studyUID = requestStudyUID || Tags.getValue(series[0], Tags.StudyInstanceUID);
  if (!studyUID) {
    return Response.json(series, { headers: { 'Cache-Control': SHORT_CACHE } });
  }
  if (!(await context.upstream.isAllowed(studyUID))) {
    return errorResponse({ status: 403 });
  }
  return storeJson(context.store, [
    [`studies/${studyUID}/series/${seriesUID}/series-singleton.json.gz`, series],
  ]);
}

/**
 * Instance query: always passes through. `create-dicomweb` writes no index file of one
 * instance, so the proxy has no stored form for an exact SOPInstanceUID.
 */
export function instanceQuery(route, request, context) {
  return passThrough(request, context);
}
