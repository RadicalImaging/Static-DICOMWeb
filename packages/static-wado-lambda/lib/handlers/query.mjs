import { Tags } from '@radicalimaging/static-wado-util/dictionary/Tags.mjs';
import { errorResponse } from '../handle.mjs';
import { findKey, onlyFilter } from '../edge/mapRequest.mjs';
import { storeJson } from './storeJson.mjs';

const JSON_ACCEPT = 'application/dicom+json, application/json';
const SHORT_CACHE = 'max-age=60';
const STUDY_KEYS = ['0020000d', 'studyinstanceuid'];
const SERIES_KEYS = ['0020000e', 'seriesinstanceuid'];

/** The query in the shape of the edge mapping, for its `findKey` and `onlyFilter` (PRX-IMP-2) */
const edgeQuery = query => Object.fromEntries([...query].map(([key, value]) => [key, { value }]));

/** The records of a QIDO answer that have `uid` in `tag`; the stored index of a UID holds no other */
const withUID = (records, tag, uid) => records.filter(record => Tags.getValue(record, tag) === uid);

/**
 * A query with no stored index form (Q19): the upstream answer with a short cache time,
 * not stored. With an allowlist, 403 (D10): the answer can name studies outside the allowlist.
 */
async function passThrough(request, context) {
  if (context.upstream.allow) {
    return errorResponse({ status: 403 });
  }
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
 * `studies?StudyInstanceUID=<uid>`) with no other filter gets the upstream study record and
 * stores it as `studies/<uid>/index.json.gz`, the form that `create-dicomweb` writes. Other
 * study queries pass through.
 */
export async function studyQuery(route, request, context) {
  const query = edgeQuery(route.query);
  const studyUID = route.studyUID || findKey(query, ...STUDY_KEYS);
  if (!studyUID || !onlyFilter(query, STUDY_KEYS)) {
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
 * The series list of a study (PRX-USR-6, D10): the upstream series records, stored as
 * `studies/<s>/series/index.json.gz`, the form that `create-dicomweb` writes.
 * shortcut: one upstream answer with no paging (the Google store gives 100 series by default);
 * page when a study has more series.
 */
async function seriesList(studyUID, context) {
  const series = await context.upstream.search(`studies/${studyUID}/series`);
  if (!series.length) {
    return errorResponse({ status: 404 });
  }
  return storeJson(context.store, [[`studies/${studyUID}/series/index.json.gz`, series]]);
}

/**
 * Series query (PRX-USR-6). `studies/<s>/series` with no filter is the series list of the
 * study. An exact SeriesInstanceUID (in the path or the query string), with no filter other
 * than the StudyInstanceUID, gets the upstream series record and stores it as
 * `studies/<s>/series/<x>/series-singleton.json.gz`, the form that `create-dicomweb` writes.
 * With no StudyInstanceUID in the request, the record gives the study; a record with no study
 * passes through. Other series queries pass through.
 * With an allowlist, a request that names no study gets 403 with no upstream search (D10).
 */
export async function seriesQuery(route, request, context) {
  const query = edgeQuery(route.query);
  const seriesUID = route.seriesUID || findKey(query, ...SERIES_KEYS);
  if (!seriesUID && route.studyUID && onlyFilter(query, [])) {
    return seriesList(route.studyUID, context);
  }
  if (!seriesUID || !onlyFilter(query, [...SERIES_KEYS, ...STUDY_KEYS])) {
    return passThrough(request, context);
  }
  const requestStudyUID = route.studyUID || findKey(query, ...STUDY_KEYS);
  // D10: no upstream search for a refused study; with no study in the request, an allowlist refuses.
  if (
    requestStudyUID ? !(await context.upstream.isAllowed(requestStudyUID)) : context.upstream.allow
  ) {
    return errorResponse({ status: 403 });
  }
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
