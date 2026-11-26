import path from 'path';
import { Tags } from '../dictionary/Tags.mjs';
import { fileToKey } from './keys.mjs';

const { getValue } = Tags;

/** The top-level attribute whose bulkdata is the frames; float pixel data is hashed bulkdata */
const pixelDataTag = '7FE00010';

/**
 * Returns a copy of the DICOM JSON metadata of one instance, with each string BulkDataURI
 * value replaced by `mapUri(uri, tag, nested)`. `tag` is the tag of the attribute that holds
 * the BulkDataURI, and `nested` is true inside a sequence item.
 * @param {Object} metadata - Metadata of one instance
 * @param {(uri: string, tag: string, nested: boolean) => string} mapUri
 * @returns {Object}
 */
export function mapBulkDataUris(metadata, mapUri) {
  function processObject(obj, tag, nested) {
    if (Array.isArray(obj)) {
      return obj.map(item => processObject(item, tag, true));
    }
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] =
          key === 'BulkDataURI' && typeof value === 'string'
            ? mapUri(value, tag, nested)
            : processObject(value, key, nested);
      }
      return result;
    }
    return obj;
  }
  return processObject(metadata, undefined, false);
}

/** Upstream bulkdata path: `.../studies/<study>/series/<series>/instances/<sop>/bulkdata/<tagpath>` */
const upstreamBulkDataRe = /\/(studies\/[^/]+\/series\/[^/]+\/instances\/[^/]+)\/bulkdata\/(.+)$/;

/**
 * Instance-relative key of proxied bulkdata. The proxy cannot hash bulkdata before the fetch,
 * so the key comes from the upstream tag path (for example `00480105/0/00282000`).
 */
const proxiedBulkDataPath = tagPath => `bulkdata/${tagPath}`;

/**
 * The key (from `studies/`) that a BulkDataURI names, or undefined when it names none.
 * An upstream bulkdata URI (any host and prefix) maps to `proxiedBulkDataPath` of the
 * instance that the URI names. A relative URI is relative to the instance directory, as
 * `create-dicomweb` writes it. A malformed URI, and a URI with a query string (the key cannot
 * hold the query), name no key.
 */
function uriToKey(uri, instanceDir) {
  let url;
  try {
    url = new URL(uri, `http://host/${instanceDir}/`);
  } catch {
    return undefined;
  }
  const { pathname, search } = url;
  if (search) return undefined;
  const upstream = upstreamBulkDataRe.exec(pathname);
  if (upstream) return `${upstream[1]}/${proxiedBulkDataPath(upstream[2])}`;
  const start = pathname.indexOf('/studies/');
  return start === -1 ? undefined : fileToKey(pathname.substring(start + 1));
}

/**
 * Rewrites every BulkDataURI to a relative URI in the storage key form (no `.mht`, `.gz`),
 * so that it resolves against the URL of the metadata to the key that `fileToKey` gives for
 * the written file:
 * - Pixel data (top-level 7FE00010, or a `./frames` URI) is `./frames` at the instance level,
 *   and `./instances/<sop>/frames` at the series level.
 * - Upstream bulkdata (an absolute URI that ends in `/instances/<sop>/bulkdata/<tagpath>`, on
 *   any host and prefix) is `./bulkdata/<tagpath>` at the instance level, and
 *   `./instances/<sop>/bulkdata/<tagpath>` at the series level. `<sop>` is the instance that
 *   the URI names.
 * - Other bulkdata keeps its path from `studies/` on, for example the hashed study-level
 *   `bulkdata/` of `create-dicomweb` (`../../bulkdata/...` at the series level).
 * - A URI with no `/studies/` path, a URI with a query string, and a malformed URI stay
 *   unchanged.
 * @param {Object|Object[]} metadata - Metadata of one instance, or an array of instances
 * @param {'instance'|'series'} level - The level of the metadata document that is written
 * @returns {Object|Object[]} A rewritten copy
 */
export function rewriteBulkDataUris(metadata, level) {
  if (Array.isArray(metadata)) {
    return metadata.map(instance => rewriteBulkDataUris(instance, level));
  }
  if (level !== 'instance' && level !== 'series') {
    throw new Error(`Unknown metadata level ${level}`);
  }
  const studyUID = getValue(metadata, Tags.StudyInstanceUID);
  const seriesUID = getValue(metadata, Tags.SeriesInstanceUID);
  const sopUID = getValue(metadata, Tags.SOPInstanceUID);
  if (!studyUID || !seriesUID || !sopUID) {
    throw new Error('Metadata needs StudyInstanceUID, SeriesInstanceUID and SOPInstanceUID');
  }
  const seriesDir = `studies/${studyUID}/series/${seriesUID}`;
  const instanceDir = `${seriesDir}/instances/${sopUID}`;
  const baseDir = level === 'series' ? seriesDir : instanceDir;

  return mapBulkDataUris(metadata, (uri, tag, nested) => {
    if ((!nested && tag === pixelDataTag) || uri.startsWith('./frames')) {
      return level === 'series' ? `./instances/${sopUID}/frames` : './frames';
    }
    const key = uriToKey(uri, instanceDir);
    if (key === undefined) return uri;
    const relative = path.posix.relative(baseDir, key);
    return relative.startsWith('../') ? relative : `./${relative}`;
  });
}

/**
 * The instance metadata documents of one series metadata response, in the form that
 * `create-dicomweb` writes (an array of one instance), with instance-level BulkDataURI values.
 * @param {Object[]} seriesMetadata - Series metadata response, before the rewrite
 * @returns {{sopInstanceUID: string, metadata: Object[]}[]}
 */
export function splitSeriesMetadata(seriesMetadata) {
  return seriesMetadata.map(instance => ({
    sopInstanceUID: getValue(instance, Tags.SOPInstanceUID),
    metadata: [rewriteBulkDataUris(instance, 'instance')],
  }));
}
