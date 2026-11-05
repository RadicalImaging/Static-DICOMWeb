// The edge request mapping (PRX-IMP-2, PRX-IMP-17). It runs in a CloudFront Function
// (cloudfront-js-2.0), so it has no imports and no syntax newer than that runtime has.
// `buildCloudFrontFunction` replaces OPTIONS and removes the export line.

var OPTIONS = { root: '/dicomweb', variants: [], collectionParameter: null };

/** Single-part frame media type to the stored extension. `.jhc` is not here: `fileToKey` strips it. */
var EXTENSIONS = {
  'image/jpeg': 'jpeg',
  'image/jls': 'jls',
  'image/jll': 'jll',
  'image/jp2': 'jp2',
  'image/jxl': 'jxl',
};

/** Query keys that page or shape a QIDO answer, and do not filter it */
var NOT_FILTERS = ['limit', 'offset', 'includefield', 'fuzzymatching'];
var PAGE_SIZE = 1000;
var UID = /^[\d.]+$/;

function findKey(querystring, tag, keyword) {
  for (var key in querystring) {
    var lower = key.toLowerCase();
    if (lower === tag || lower === keyword) {
      return querystring[key].value;
    }
  }
  return undefined;
}

/** True when the query has no filter key other than `allowed` */
function onlyFilter(querystring, allowed) {
  for (var key in querystring) {
    var lower = key.toLowerCase();
    if (allowed.indexOf(lower) === -1 && NOT_FILTERS.indexOf(lower) === -1) {
      return false;
    }
  }
  return true;
}

/**
 * Maps a request to the canonical storage key (the S3 key, the cache key, and the failover
 * path), in the shapes of a CloudFront Function event:
 * - a single frame with a single-part `Accept` of a permitted variant: `frames/<n>.<extension>`;
 * - `studies?<collection parameter>=<id>[&offset=<n>]` (no other filter, offset a multiple
 *   of 1000): `collections/<id>/studies[/<offset>]`;
 * - `studies?StudyInstanceUID=<uid>` (no other filter): `studies/<uid>`;
 * - `studies/<s>/series?SeriesInstanceUID=<x>` or `studies/<s>/series/<x>` (no other filter):
 *   `studies/<s>/series/<x>/series-singleton.json`;
 * - other requests: unchanged.
 * A mapped query loses its query string.
 * @param {{uri: string, querystring: Object, headers: Object}} request - `querystring` and
 *   `headers` hold `{ value }` objects; header names are lower case
 * @param {{root: string, variants: string[], collectionParameter: ?string}} [options]
 * @returns {{uri: string, querystring: Object}}
 */
function mapRequest(request, options) {
  var opts = options || OPTIONS;
  var uri = request.uri;
  var query = request.querystring || {};
  if (uri.indexOf(opts.root + '/') !== 0) {
    return { uri: uri, querystring: query };
  }
  var path = uri.substring(opts.root.length + 1);
  var mapped = function (key) {
    return { uri: opts.root + '/' + key, querystring: {} };
  };

  if (/\/frames\/\d+$/.test(path)) {
    var accept = request.headers && request.headers.accept && request.headers.accept.value;
    var type = accept && accept.split(',')[0].split(';')[0].trim();
    var extension = type && EXTENSIONS[type];
    if (extension && opts.variants.indexOf(extension) !== -1) {
      return { uri: uri + '.' + extension, querystring: query };
    }
    return { uri: uri, querystring: query };
  }

  if (path === 'studies') {
    var parameter = opts.collectionParameter;
    var collection = parameter && findKey(query, parameter.toLowerCase(), undefined);
    if (collection && /^[\w-]+$/.test(collection) && onlyFilter(query, [parameter.toLowerCase()])) {
      var offset = Number(findKey(query, 'offset') || 0);
      if (offset % PAGE_SIZE === 0) {
        return mapped('collections/' + collection + '/studies' + (offset ? '/' + offset : ''));
      }
    }
    var studyUID = findKey(query, '0020000d', 'studyinstanceuid');
    if (studyUID && UID.test(studyUID) && onlyFilter(query, ['0020000d', 'studyinstanceuid'])) {
      return mapped('studies/' + studyUID);
    }
    return { uri: uri, querystring: query };
  }

  var series = /^(studies\/[\d.]+\/series)(?:\/([\d.]+))?$/.exec(path);
  if (series) {
    var seriesUID = series[2] || findKey(query, '0020000e', 'seriesinstanceuid');
    if (seriesUID && UID.test(seriesUID) && onlyFilter(query, ['0020000e', 'seriesinstanceuid'])) {
      return mapped(series[1] + '/' + seriesUID + '/series-singleton.json');
    }
  }
  return { uri: uri, querystring: query };
}

export { mapRequest, OPTIONS };
