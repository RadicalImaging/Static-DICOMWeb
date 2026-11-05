const UID = '(?:\\d+\\.)*\\d+';
const study = `studies/(?<studyUID>${UID})`;
const series = `${study}/series/(?<seriesUID>${UID})`;
const instance = `${series}/instances/(?<sopUID>${UID})`;

/** Route kind and path pattern, relative to the DICOMweb root. First match wins. */
const routes = [
  ['studyQuery', `studies(?:/(?<studyUID>${UID}))?`],
  ['seriesQuery', `series|${study}/series(?:/(?<seriesUID>${UID}))?`],
  ['instanceQuery', `instances|${study}(?:/series/(?<seriesUID>${UID}))?/instances`],
  ['seriesMetadata', `${series}/metadata`],
  ['instanceMetadata', `${instance}/metadata`],
  ['frames', `${instance}/frames/(?<frames>\\d+(?:,\\d+)*)(?:\\.(?<variant>[a-z0-9]+))?`],
  ['bulkdata', `${instance}/bulkdata/(?<tagPath>[0-9A-F]{8}(?:/\\d+/[0-9A-F]{8})*)`],
  [
    'thumbnail',
    `${study}(?:/series/(?<seriesUID>${UID})(?:/instances/(?<sopUID>${UID}))?)?/thumbnail`,
  ],
  ['part10', instance],
  ['collection', `collections/(?<collection>[\\w-]+)/studies(?:/(?<offset>\\d+))?`],
].map(([kind, pattern]) => [kind, new RegExp(`^(?:${pattern})$`)]);

/**
 * Parses a normalized request path into a route. The path is relative to the DICOMweb root
 * (no leading slash), in the canonical form that the edge mapping gives.
 *
 * - `kind`: studyQuery, seriesQuery, instanceQuery, seriesMetadata, instanceMetadata, frames,
 *   bulkdata, thumbnail, part10, or collection. A query path with a UID at its own level (for
 *   example `studies/<uid>`) is the exact-UID index of that UID.
 * - `frames`: the 1-based frame numbers; `variant`: the extension of a single-part frame.
 * - `tagPath`: the bulkdata tag path, for example `00480105/0/00282000`.
 * - `collection`, `offset`: the collection page; `offset` is a number or undefined.
 * - `query`: the URLSearchParams of the request.
 * @param {string} path - Path relative to the DICOMweb root
 * @param {URLSearchParams} [query]
 * @returns {Object|undefined} The route, or undefined for an unknown path (404)
 */
export function route(path, query = new URLSearchParams()) {
  for (const [kind, re] of routes) {
    const match = re.exec(path);
    if (!match) {
      continue;
    }
    const groups = match.groups || {};
    return {
      ...groups,
      kind,
      frames: groups.frames?.split(',').map(Number),
      offset: groups.offset && Number(groups.offset),
      query,
    };
  }
  return undefined;
}

export default route;
