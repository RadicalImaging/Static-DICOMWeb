/**
 * Covers serving the stored Part 10 rendition (instances/<sop>/index.mht.gz).
 *
 * Two things this exercises that are easy to get wrong: a multipart/related response is
 * unparseable without the boundary of the stored wrapper, and the payload is unwrapped by
 * streaming - so the closing delimiter must be withheld across chunk boundaries without
 * buffering the whole instance.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { Writable } from 'stream';
import { createVerboseLog } from '@radicalimaging/static-wado-util';
import part10Controller from '../../lib/controllers/server/part10Controller.mjs';
import { dicomMap } from '../../lib/adapters/requestAdapters.mjs';

createVerboseLog(false, { quiet: true });

const STUDY = '1.2.3';
const SERIES = '1.2.3.4';
const SOP = '1.2.3.4.5';
const REQUEST_PATH = `/studies/${STUDY}/series/${SERIES}/instances/${SOP}`;
const BOUNDARY = 'BOUNDARY_5f0c1b3a-0000-4000-8000-000000000000';

/** Express response double: a Writable, so it can be the destination of a pipeline */
class MockResponse extends Writable {
  constructor() {
    super();
    this.headers = {};
    this.chunks = [];
    this.statusCode = 200;
    this.sent = null;
    this.sentFile = null;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  send(body) {
    this.sent = body;
    return this;
  }

  sendFile(filePath) {
    this.sentFile = filePath;
    return this;
  }

  get streamed() {
    return Buffer.concat(this.chunks);
  }
}

/**
 * @param {string} accept - Accept header value
 * @returns {object} Express request double
 */
function createRequest(accept) {
  return {
    params: { studyUID: STUDY, seriesUID: SERIES, instanceUID: SOP },
    query: {},
    header: name => (name.toLowerCase() === 'accept' ? accept : undefined),
    path: REQUEST_PATH,
    staticWadoPath: REQUEST_PATH,
  };
}

/**
 * Wraps a payload the way the writers do.
 * @param {Buffer} payload
 * @returns {Buffer}
 */
function multipartBody(payload) {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\nContent-Location: x\r\n\r\n`),
    payload,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

/**
 * Deterministic pseudo-random bytes, so a payload spans many stream chunks and the tail
 * handling is exercised without depending on Math.random.
 * @param {number} length
 * @returns {Buffer}
 */
function payloadOf(length) {
  const out = Buffer.alloc(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + (i >> 8)) & 0xff;
  return out;
}

describe('part10Controller stored rendition', () => {
  let baseDir;
  let instanceDir;
  let controller;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'part10-'));
    instanceDir = path.join(baseDir, 'studies', STUDY, 'series', SERIES, 'instances', SOP);
    fs.mkdirSync(instanceDir, { recursive: true });
    controller = part10Controller({ dir: baseDir });
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  /**
   * @param {Buffer} payload - Part 10 bytes to store
   * @param {boolean} [gzip] - Store as index.mht.gz rather than index.mht
   * @returns {string} Path written
   */
  function storeRendition(payload, gzip = true) {
    const body = multipartBody(payload);
    const filePath = path.join(instanceDir, gzip ? 'index.mht.gz' : 'index.mht');
    fs.writeFileSync(filePath, gzip ? zlib.gzipSync(body) : body);
    return filePath;
  }

  it('advertises the stored boundary and falls through for a gzipped rendition', async () => {
    storeRendition(payloadOf(4096));
    const req = createRequest('multipart/related; type="application/dicom"');
    const res = new MockResponse();
    const next = jest.fn();

    await controller(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.getHeader('content-type')).toBe(
      `multipart/related; type="application/dicom"; boundary="${BOUNDARY}"`
    );

    // dicomMap runs next and must not replace the boundary-carrying type with its default
    dicomMap(req, res, () => {});
    expect(res.getHeader('content-type')).toContain(`boundary="${BOUNDARY}"`);
    expect(req.url).toBe(`${REQUEST_PATH}/index.mht.gz`);
  });

  it('sends an uncompressed rendition directly, with the boundary', async () => {
    const filePath = storeRendition(payloadOf(1024), false);
    const req = createRequest('multipart/related; type="application/dicom"');
    const res = new MockResponse();
    const next = jest.fn();

    await controller(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.sentFile).toBe(path.resolve(filePath));
    expect(res.getHeader('content-type')).toContain(`boundary="${BOUNDARY}"`);
  });

  it('streams the exact payload for application/dicom', async () => {
    const payload = payloadOf(64 * 1024);
    storeRendition(payload);
    const req = createRequest('application/dicom');
    const res = new MockResponse();
    const next = jest.fn();

    await controller(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.getHeader('content-type')).toBe('application/dicom');
    expect(res.getHeader('content-disposition')).toBe(`attachment; filename="${SOP}.dcm"`);
    expect(res.streamed.equals(payload)).toBe(true);
  });

  it('streams a payload larger than the retained tail across many chunks', async () => {
    // Several MB: more chunks than the gunzip buffer size, so the closing delimiter has
    // to be withheld from a tail that is refilled repeatedly.
    const payload = payloadOf(5 * 1024 * 1024 + 517);
    storeRendition(payload);
    const req = createRequest('application/dicom');
    const res = new MockResponse();

    await controller(req, res, jest.fn());

    expect(res.chunks.length).toBeGreaterThan(1);
    expect(res.streamed.length).toBe(payload.length);
    expect(res.streamed.equals(payload)).toBe(true);
  });

  it('handles a payload shorter than the retained tail', async () => {
    const payload = payloadOf(7);
    storeRendition(payload);
    const req = createRequest('application/dicom');
    const res = new MockResponse();

    await controller(req, res, jest.fn());

    expect(res.streamed.equals(payload)).toBe(true);
  });

  it('serves an uncompressed rendition for application/dicom too', async () => {
    const payload = payloadOf(9000);
    storeRendition(payload, false);
    const req = createRequest('application/dicom');
    const res = new MockResponse();

    await controller(req, res, jest.fn());

    expect(res.streamed.equals(payload)).toBe(true);
  });

  it('falls through to generation when the stored file is not a multipart wrapper', async () => {
    // A gzipped JSON body stored under the rendition name: nothing to unwrap
    fs.writeFileSync(
      path.join(instanceDir, 'index.mht.gz'),
      zlib.gzipSync(Buffer.from('[{"00080018":{}}]'))
    );
    const req = createRequest('application/dicom');
    const res = new MockResponse();
    const next = jest.fn();

    await controller(req, res, next);

    // Generation has no metadata to work from here, so it reports not-found rather than
    // serving the unusable stored file.
    expect(res.streamed.length).toBe(0);
    expect(res.statusCode).toBe(404);
  });
});
