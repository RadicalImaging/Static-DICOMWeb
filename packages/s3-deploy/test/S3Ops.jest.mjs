/**
 * Naming and content-type round trip for s3 deploys.
 *
 * fileToKey strips ".mht" on upload, so a listing can only guess "<key>.gz" for an
 * extension-less key. retrieveFileName (from the response headers) and localCandidates
 * (from the name alone) both have to arrive back at the name the file was written under,
 * and fileToContentType decides what a client is told the object is.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import S3Ops from '../lib/S3Ops.mjs';

const config = {
  region: 'us-east-1',
  deployGroup: { Bucket: 'test-bucket', dir: '/tmp/dicomweb' },
};

/**
 * @param {object} [options]
 * @returns {S3Ops}
 */
function createOps(options = {}) {
  return new S3Ops(config, 'deploy', options);
}

const BOUNDARY = 'BOUNDARY_5f0c1b3a-0000-4000-8000-000000000000';

/** @returns {Buffer} a multipart/related body as the writers produce it */
function multipartBody() {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
    Buffer.from('DICM-ish payload'),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

describe('fileToContentType', () => {
  const ops = createOps();

  it('labels multipart frame and instance files multipart/related', () => {
    expect(ops.fileToContentType('studies/1/series/2/instances/3/frames/1.mht.gz')).toBe(
      'multipart/related'
    );
    expect(ops.fileToContentType('studies/1/series/2/instances/3/index.mht.gz')).toBe(
      'multipart/related'
    );
    // Extension-less frame files are multipart wrappers too
    expect(ops.fileToContentType('studies/1/series/2/instances/3/frames/1')).toBe(
      'multipart/related'
    );
  });

  it('labels raw codestream frames by their transfer syntax, not multipart', () => {
    // These are single-part binaries; multipart/related would send clients hunting for a
    // boundary that is not in the object.
    expect(ops.fileToContentType('studies/1/series/2/instances/3/frames/1.jxl')).toBe(
      'image/x-jxl'
    );
    expect(ops.fileToContentType('studies/1/series/2/instances/3/frames/1.jll')).toBe('image/jll');
    expect(ops.fileToContentType('studies/1/series/2/instances/3/frames/1.jls.gz')).toBe(
      'image/jls'
    );
    expect(ops.fileToContentType('studies/1/series/2/instances/3/frames/1.jhc')).toBe('image/jphc');
  });

  it('keeps the existing types for other content', () => {
    expect(ops.fileToContentType('studies/1/series/2/metadata.gz')).toBe('application/json');
    expect(ops.fileToContentType('studies/1/bulkdata/ab/cd/hash.mht.gz')).toBe('multipart/related');
    expect(ops.fileToContentType('studies/1/series/2/instances/3/thumbnail')).toBe('image/jpeg');
    expect(ops.fileToContentType('studies/1/index.json.gz')).toBe('application/json');
  });
});

describe('retrieveFileName and localCandidates agree', () => {
  const ops = createOps();

  /**
   * Asserts that the name a retrieve writes is one a later listing would look for.
   * @param {string} guessed - Name the listing guesses for the key
   * @param {string} contentEncoding
   * @param {string} expected - Name the retrieve should write
   */
  function expectRoundTrip(guessed, contentEncoding, expected) {
    const written = ops.retrieveFileName(guessed, 'multipart/related', contentEncoding);
    expect(written).toBe(expected);
    expect(ops.localCandidates(guessed)).toContain(written);
  }

  it('restores .mht.gz for a gzipped extension-less key', () => {
    expectRoundTrip(
      'studies/1/series/2/instances/3/frames/1.gz',
      'gzip',
      'studies/1/series/2/instances/3/frames/1.mht.gz'
    );
  });

  it('restores .mht for an uncompressed extension-less key', () => {
    expectRoundTrip(
      'studies/1/series/2/instances/3/frames/1.gz',
      undefined,
      'studies/1/series/2/instances/3/frames/1.mht'
    );
  });

  it('restores index.mht.gz for a directory-index guess', () => {
    expectRoundTrip(
      'studies/1/series/2/instances/3/index.json.gz',
      'gzip',
      'studies/1/series/2/instances/3/index.mht.gz'
    );
  });

  it('handles windows separators the same as posix ones', () => {
    const guessed = 'studies\\1\\series\\2\\instances\\3\\index.json.gz';
    const written = ops.retrieveFileName(guessed, 'multipart/related', 'gzip');
    expect(written).toBe('studies\\1\\series\\2\\instances\\3\\index.mht.gz');
    expect(ops.localCandidates(guessed)).toContain(written);
  });

  it('leaves non-multipart objects and named extensions alone', () => {
    expect(ops.retrieveFileName('studies/1/metadata.gz', 'application/json', 'gzip')).toBe(
      'studies/1/metadata.gz'
    );
    expect(ops.retrieveFileName('studies/1/frames/1.jls', 'multipart/related', undefined)).toBe(
      'studies/1/frames/1.jls'
    );
    expect(ops.localCandidates('studies/1/frames/1.jls')).toEqual(['studies/1/frames/1.jls']);
  });
});

describe('retrieve skips work that is already local', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3ops-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips when the corrected .mht.gz name already exists', async () => {
    const ops = createOps();
    const instanceDir = path.join(dir, 'instances', '3');
    fs.mkdirSync(instanceDir, { recursive: true });
    const corrected = path.join(instanceDir, 'index.mht.gz');
    fs.writeFileSync(corrected, zlib.gzipSync(multipartBody()));

    // The listing can only guess index.json.gz for this key
    const result = await ops.retrieve(
      'deploy/instances/3',
      path.join(instanceDir, 'index.json.gz')
    );

    expect(result).toBe(corrected);
  });

  it('corrects a stale file at the guessed name instead of leaving it unreachable', async () => {
    const ops = createOps();
    const instanceDir = path.join(dir, 'instances', '3');
    fs.mkdirSync(instanceDir, { recursive: true });
    const stale = path.join(instanceDir, 'index.json.gz');
    fs.writeFileSync(stale, zlib.gzipSync(multipartBody()));

    const result = await ops.retrieve('deploy/instances/3', stale);

    expect(result).toBe(path.join(instanceDir, 'index.mht.gz'));
    expect(fs.existsSync(result)).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('leaves a genuine json index where it is', async () => {
    const ops = createOps();
    const studyDir = path.join(dir, 'studies');
    fs.mkdirSync(studyDir, { recursive: true });
    const index = path.join(studyDir, 'index.json.gz');
    fs.writeFileSync(index, zlib.gzipSync(Buffer.from('[{"0020000D":{}}]')));

    const result = await ops.retrieve('deploy/studies', index);

    expect(result).toBe(index);
    expect(fs.existsSync(index)).toBe(true);
  });
});
