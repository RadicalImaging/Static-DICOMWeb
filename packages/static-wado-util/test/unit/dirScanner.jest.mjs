import fs from 'fs';
import os from 'os';
import path from 'path';
import dirScanner from '../../lib/reader/dirScanner.js';

describe('dirScanner', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-scanner-'));
    for (const name of ['a.dcm', 'b.dcm']) fs.writeFileSync(path.join(dir, name), 'data');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const lstatSync = fs.lstatSync;
    jest.spyOn(fs, 'lstatSync').mockImplementation((target, ...rest) => {
      if (String(target).endsWith('a.dcm')) {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      }
      return lstatSync(target, ...rest);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Test 54. The API must do this (SQR-U5): a bulk import counts an unreadable path as failed,
  // and continues with the next path. Without onError, the error throws.
  it('gives an unreadable path to onError, and scans the next path', async () => {
    const scanned = [];
    const failed = [];
    const files = [path.join(dir, 'a.dcm'), path.join(dir, 'b.dcm')];
    await dirScanner(files, {
      callback: file => scanned.push(path.basename(file)),
      onError: (file, err) => failed.push([path.basename(file), err.code]),
    });
    expect(failed).toEqual([['a.dcm', 'EACCES']]);
    expect(scanned).toEqual(['b.dcm']);

    await expect(dirScanner(files, { callback: () => {} })).rejects.toMatchObject({
      code: 'EACCES',
    });
  });
});
