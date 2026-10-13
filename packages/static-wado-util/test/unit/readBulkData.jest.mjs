import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { createVerboseLog, readBulkData } from '../../lib/index.js';

createVerboseLog(false, { quiet: true });

describe('readBulkData', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-bulkdata-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // static-wado-creator ends the closing delimiter without "\r\n", create-dicomweb with it
  it.each([
    ['without', ''],
    ['with', '\r\n'],
  ])('returns the exact payload when the closing delimiter ends %s CRLF', async (_, end) => {
    const payload = Buffer.from('DICM payload ending in \r\n');
    const body = Buffer.concat([
      Buffer.from('--BOUNDARY_1\r\nContent-Type: application/dicom\r\n\r\n'),
      payload,
      Buffer.from(`\r\n--BOUNDARY_1--${end}`),
    ]);
    fs.writeFileSync(path.join(dir, 'index.mht.gz'), zlib.gzipSync(body));

    const { binaryData } = await readBulkData(dir, 'index.mht');

    expect(Buffer.from(binaryData).equals(payload)).toBe(true);
  });
});
