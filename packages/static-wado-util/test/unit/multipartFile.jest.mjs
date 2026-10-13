/**
 * Covers the multipart sniff used to recover the ".mht" name that fileToKey strips on
 * upload. The distinction that matters: content that is genuinely a multipart body versus
 * binary content (bulkdata, frames) that merely starts with the two bytes of a delimiter.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { looksMultipart, renameLegacyMultipart } from '../../lib/multipartFile.mjs';

const BOUNDARY = 'BOUNDARY_5f0c1b3a-0000-4000-8000-000000000000';

/**
 * A multipart/related body as the writers produce it.
 * @param {Buffer|string} payload
 * @returns {Buffer}
 */
function multipartBody(payload = 'DICM-ish payload') {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\nContent-Location: x\r\n\r\n`),
    Buffer.from(payload),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

describe('looksMultipart', () => {
  it('accepts a delimiter line followed by a MIME header', () => {
    expect(looksMultipart(multipartBody())).toBe(true);
  });

  it('rejects binary content that merely starts with "--"', () => {
    // 0x2d 0x2d then arbitrary bytes: a bulkdata blob, not a multipart body
    const blob = Buffer.concat([Buffer.from([0x2d, 0x2d]), Buffer.alloc(64, 0xa7)]);
    expect(looksMultipart(blob)).toBe(false);
  });

  it('rejects a delimiter line with no header after it', () => {
    expect(looksMultipart(Buffer.from(`--${BOUNDARY}\r\n\r\nbody`))).toBe(false);
  });

  it('rejects JSON and short buffers', () => {
    expect(looksMultipart(Buffer.from('[{"00080018":{}}]'))).toBe(false);
    expect(looksMultipart(Buffer.from('--'))).toBe(false);
    expect(looksMultipart(Buffer.alloc(0))).toBe(false);
  });
});

describe('renameLegacyMultipart', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multipart-file-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /**
   * @param {string} name - File name to create under the temp dir
   * @param {Buffer} content
   * @returns {string} Full path
   */
  function write(name, content) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    return full;
  }

  it('renames uncompressed multipart content to .mht', async () => {
    const src = write('sop.gz', multipartBody());
    expect(await renameLegacyMultipart(src, path.join(dir, 'sop'))).toBe(path.join(dir, 'sop.mht'));
    expect(fs.existsSync(src)).toBe(false);
  });

  it('renames gzipped multipart content to .mht.gz', async () => {
    const src = write('sop.gz', zlib.gzipSync(multipartBody()));
    expect(await renameLegacyMultipart(src, path.join(dir, 'sop'))).toBe(
      path.join(dir, 'sop.mht.gz')
    );
  });

  it('leaves gzipped JSON alone', async () => {
    const src = write('metadata.gz', zlib.gzipSync(Buffer.from('[{"00080018":{}}]')));
    expect(await renameLegacyMultipart(src, path.join(dir, 'metadata'))).toBeUndefined();
    expect(fs.existsSync(src)).toBe(true);
  });

  it('does not overwrite an existing corrected file', async () => {
    const src = write('sop.gz', multipartBody());
    write('sop.mht', multipartBody('other'));
    expect(await renameLegacyMultipart(src, path.join(dir, 'sop'))).toBeUndefined();
    expect(fs.existsSync(src)).toBe(true);
  });
});
