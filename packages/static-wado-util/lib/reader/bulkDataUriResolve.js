const path = require('path');

function isHttpAbsolute(uri) {
  return /^https?:\/\//i.test(String(uri || '').trim());
}

function joinPosix(a, b) {
  if (!b) return a;
  if (!a) return b;
  return path.posix.normalize(`${a.replace(/\/+$/, '')}/${b.replace(/^\/+/, '')}`);
}

/**
 * Longest-prefix anchor among study / series / instance roots so readBulkData(dir, relative) works.
 *
 * @param {string} resolved
 * @param {string} studyUID
 * @param {string} seriesUID
 * @param {string} [instanceUID]
 * @returns {string} dirSuffix under dicomweb root
 */
function pickReadBulkAnchorDir(resolved, studyUID, seriesUID, instanceUID) {
  const study = `studies/${studyUID}`;
  const series = `${study}/series/${seriesUID}`;
  const inst = instanceUID ? `${series}/instances/${instanceUID}` : null;
  const candidates = [inst, series, study].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    if (resolved === c || resolved.startsWith(`${c}/`)) {
      return c;
    }
  }
  return study;
}

/**
 * Resolve where bulk bytes live for static DICOMweb layout (no metadata-document / referent levels).
 *
 * @param {string} bulkDataURI
 * @param {{
 *   studyUID: string,
 *   seriesUID: string,
 *   instanceUID?: string,
 *   frameNumber?: number,
 * }} options
 * @returns {{
 *   kind: 'httpAbsolute',
 *   url: string,
 * } | {
 *   kind: 'readBulkData',
 *   dirSuffix: string,
 *   baseName: string,
 *   frame?: number,
 * }}
 */
function resolveBulkDataLocation(bulkDataURI, options) {
  const { studyUID, seriesUID, instanceUID, frameNumber } = options || {};
  if (!studyUID || !seriesUID) {
    throw new Error('resolveBulkDataLocation requires studyUID and seriesUID');
  }
  const uri = String(bulkDataURI ?? '');
  const seriesSuffix = `studies/${studyUID}/series/${seriesUID}`;

  if (isHttpAbsolute(uri)) {
    const frameSuffix = frameNumber ? `/${frameNumber}` : '';
    return { kind: 'httpAbsolute', url: `${uri.trim()}${frameSuffix}` };
  }

  if (uri.trimStart().startsWith('studies/')) {
    let p = path.posix.normalize(uri.trim());
    const fm = frameNumber;
    if (fm && /\/frames$/.test(p)) {
      const dirSuffix = p.replace(/\/frames$/, '');
      return {
        kind: 'readBulkData',
        dirSuffix,
        baseName: './frames',
        frame: fm,
      };
    }
    if (fm && /\/frames\/\d+$/.test(p)) {
      const dirSuffix = p.replace(/\/frames\/\d+$/, '');
      return {
        kind: 'readBulkData',
        dirSuffix,
        baseName: './frames',
        frame: fm,
      };
    }
    const anchor = pickReadBulkAnchorDir(p, studyUID, seriesUID, instanceUID);
    let baseName = path.posix.relative(anchor, p);
    if (!baseName || baseName === '') {
      baseName = '.';
    }
    return {
      kind: 'readBulkData',
      dirSuffix: anchor,
      baseName,
      frame: fm,
    };
  }

  if (uri.indexOf('frames') !== -1) {
    const isSeriesRelative = uri.startsWith('./instances/');
    if (!isSeriesRelative && !instanceUID) {
      throw new Error(
        'No SOPInstanceUID in instance metadata; cannot resolve instance-relative frames path'
      );
    }
    const dirSuffix = isSeriesRelative ? seriesSuffix : `${seriesSuffix}/instances/${instanceUID}`;
    const baseName = isSeriesRelative ? uri : './frames';
    return {
      kind: 'readBulkData',
      dirSuffix,
      baseName,
      frame: frameNumber,
    };
  }

  return {
    kind: 'readBulkData',
    dirSuffix: seriesSuffix,
    baseName: uri.trim(),
    frame: frameNumber,
  };
}

/**
 * HTTP path under server root (no leading slash), for byte-range / static file fetch.
 *
 * @param {{ kind: string, url?: string, dirSuffix?: string, baseName?: string, frame?: number }} spec
 * @returns {string}
 */
function bulkDataHttpPathUnderRoot(spec) {
  if (spec.kind === 'httpAbsolute') {
    return spec.url;
  }
  if (spec.kind === 'readBulkData') {
    let p = path.posix.normalize(`${spec.dirSuffix}/${spec.baseName}`.replace(/\/+/g, '/'));
    if (spec.frame) {
      p = `${p}/${spec.frame}`;
    }
    return p;
  }
  throw new Error(`Unknown resolve spec kind: ${spec.kind}`);
}

/**
 * Series-summary rewrite: instance-relative bulk URIs for series-level JSON.
 *
 * @param {string} bulkDataURI
 * @param {string} instanceUid
 * @returns {string}
 */
function rewriteBulkDataUriForSeriesMetadata(bulkDataURI, instanceUid) {
  if (typeof bulkDataURI !== 'string') {
    return bulkDataURI;
  }
  if (bulkDataURI === './frames' || bulkDataURI.startsWith('./frames')) {
    return `./instances/${instanceUid}/frames`;
  }
  return bulkDataURI.replace(/^(\.\.\/){4}bulkdata\//, '../../bulkdata/');
}

/**
 * Relative BulkDataURI written at instance metadata depth (matches writeBulkdataFilter).
 *
 * @param {string} hashPath e.g. ec/61/....mht.gz (no leading slash)
 * @returns {string}
 */
function bulkDataUriRelativeFromInstance(hashPath) {
  return `../../../../bulkdata/${hashPath}`;
}

module.exports = {
  resolveBulkDataLocation,
  bulkDataHttpPathUnderRoot,
  rewriteBulkDataUriForSeriesMetadata,
  bulkDataUriRelativeFromInstance,
};
