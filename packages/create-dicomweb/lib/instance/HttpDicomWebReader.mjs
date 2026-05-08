import { Readable } from 'stream';
import { extractMultipart } from '@radicalimaging/static-wado-util';
import { DicomWebReader } from './DicomWebReader.mjs';

/**
 * Extract transfer-syntax UID from a Content-Type header value (HTTP or MIME part).
 * @param {string} ct
 * @returns {string|null}
 */
function transferSyntaxUidFromContentTypeHeader(ct) {
  if (!ct) return null;
  const m = ct.match(/transfer-syntax\s*=\s*["']?([0-9.]+)["']?/i);
  return m ? m[1] : null;
}

/**
 * Extract transfer syntax UID from WADO-RS / fetch response headers.
 * @param {Headers} headers
 * @returns {string|null}
 */
function transferSyntaxUidFromResponseHeaders(headers) {
  const ct = headers.get('content-type') || '';
  const fromCt = transferSyntaxUidFromContentTypeHeader(ct);
  if (fromCt) return fromCt;
  for (const name of ['x-transfer-syntax-uid', 'x-dicom-transfer-syntax']) {
    const v = headers.get(name);
    if (v?.trim()) return v.trim();
  }
  return null;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function joinUrlPath(baseUrl, relativePath, filename = '') {
  const parts = [baseUrl, relativePath, filename].filter(Boolean);
  return parts
    .join('/')
    .replace(/([^:]\/)\/+/g, '$1');
}

export class HttpDicomWebReader extends DicomWebReader {
  constructor(baseUrl) {
    super(baseUrl);
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  _mapRelativePathToQido(relativePath, filename) {
    if (filename !== 'index.json') return null;
    const parts = String(relativePath || '')
      .split('/')
      .filter(Boolean);
    if (parts[0] !== 'studies') return null;
    if (parts.length === 1) return 'studies';
    if (parts.length === 2) return `studies/${parts[1]}`;
    if (parts.length === 3 && parts[2] === 'series') return `studies/${parts[1]}/series`;
    return null;
  }

  _resolveBulkDataPath(studyUID, seriesUID, bulkDataURI, frameNumber) {
    const frameSuffix = frameNumber ? `/${frameNumber}` : '';
    if (/^https?:\/\//i.test(bulkDataURI)) {
      return `${bulkDataURI}${frameSuffix}`;
    }

    if (bulkDataURI.startsWith('./')) {
      const rel = bulkDataURI.slice(2);
      return joinUrlPath(this.baseUrl, `studies/${studyUID}/series/${seriesUID}`, `${rel}${frameSuffix}`);
    }

    if (bulkDataURI.startsWith('instances/')) {
      return joinUrlPath(
        this.baseUrl,
        `studies/${studyUID}/series/${seriesUID}`,
        `${bulkDataURI}${frameSuffix}`
      );
    }

    if (bulkDataURI.startsWith('studies/')) {
      return joinUrlPath(this.baseUrl, `${bulkDataURI}${frameSuffix}`);
    }

    return joinUrlPath(
      this.baseUrl,
      `studies/${studyUID}/series/${seriesUID}`,
      `${bulkDataURI}${frameSuffix}`
    );
  }

  async _fetch(url) {
    console.verbose('[HttpDicomWebReader] GET', url);
    const response = await fetch(url);
    const ct = response.headers.get('content-type');
    const cl = response.headers.get('content-length');
    console.verbose(
      `[HttpDicomWebReader] <- ${response.status} ${response.statusText}`,
      ct ? `content-type=${ct}` : '',
      cl != null ? `content-length=${cl}` : ''
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response;
  }

  async readJsonFile(relativePath, filename) {
    const qidoPath = this._mapRelativePathToQido(relativePath, filename);
    if (qidoPath) {
      const reqUrl = joinUrlPath(this.baseUrl, qidoPath);
      console.verbose('[HttpDicomWebReader] readJsonFile (QIDO)', reqUrl);
      const response = await this._fetch(reqUrl);
      if (!response) return undefined;
      return response.json();
    }

    const reqUrl = joinUrlPath(this.baseUrl, relativePath, filename);
    console.verbose('[HttpDicomWebReader] readJsonFile', reqUrl);
    const response = await this._fetch(reqUrl);
    if (!response) return undefined;
    return response.json();
  }

  async openInputStream(relativePath, filename) {
    const response = await this._fetch(joinUrlPath(this.baseUrl, relativePath, filename));
    if (!response) return undefined;
    if (!response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      return Readable.from(buffer);
    }
    return Readable.fromWeb(response.body);
  }

  async readBulkData(studyUID, seriesUID, bulkDataURI, frameNumber = undefined, instanceUID = undefined) {
    const url = this._resolveBulkDataPath(studyUID, seriesUID, bulkDataURI, frameNumber);
    const response = await this._fetch(url);
    if (!response) return null;
    let binaryData = await response.arrayBuffer();
    const outerContentType = response.headers.get('content-type') || 'application/octet-stream';
    let contentType = outerContentType;
    let transferSyntaxUid = transferSyntaxUidFromResponseHeaders(response.headers);
    let wasMultipart = false;
    let transferSyntaxFromInnerPart = false;

    /** WADO-RS frame bodies are often multipart/related: decode inner part and read transfer-syntax from its Content-Type */
    if (/multipart/i.test(outerContentType)) {
      wasMultipart = true;
      try {
        const extracted = extractMultipart(outerContentType, binaryData);
        if (extracted?.pixelData?.byteLength) {
          binaryData = extracted.pixelData;
          const partCt = extracted.multipartContentType || extracted.contentType || '';
          const fromPart = transferSyntaxUidFromContentTypeHeader(partCt);
          if (fromPart) {
            transferSyntaxUid = fromPart;
            transferSyntaxFromInnerPart = true;
          }
          if (extracted.contentType && extracted.contentType !== outerContentType) {
            contentType = extracted.contentType;
          }
          console.verbose(
            `[HttpDicomWebReader] readBulkData extracted multipart part bytes=${binaryData.byteLength} partContentType=${partCt.slice(0, 120)} transferSyntaxUid=${transferSyntaxUid ?? '(not in part)'} transferSyntaxFromInnerPart=${transferSyntaxFromInnerPart}`
          );
        }
      } catch (err) {
        console.verbose('[HttpDicomWebReader] multipart extract failed; using full response buffer', err);
      }
    }

    console.verbose(
      `[HttpDicomWebReader] readBulkData frame=${frameNumber ?? 'n/a'} bytes=${binaryData.byteLength} transferSyntaxUid=${transferSyntaxUid ?? '(not in headers)'} wasMultipart=${wasMultipart}`
    );
    return {
      binaryData,
      transferSyntaxUid,
      contentType,
      wasMultipart,
      transferSyntaxFromInnerPart,
    };
  }

  async queryStudies(studySelector) {
    let query = '';
    if (typeof studySelector === 'string' && studySelector !== 'true') {
      query = `?${studySelector}`;
    }
    const reqUrl = joinUrlPath(this.baseUrl, `studies${query}`);
    console.verbose('[HttpDicomWebReader] queryStudies', reqUrl);
    const response = await this._fetch(reqUrl);
    if (!response) return [];
    const list = await response.json();
    return Array.isArray(list) ? list : [];
  }
}
