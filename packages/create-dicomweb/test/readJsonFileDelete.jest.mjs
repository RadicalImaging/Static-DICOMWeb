import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import { FileDicomWebReader } from '../lib/instance/FileDicomWebReader.mjs';

/**
 * readJsonFile with deleteFileOnError deletes a corrupt file only. A correct file can give
 * a transient I/O error (ESTALE on a network file system), and must stay.
 */
describe('FileDicomWebReader.readJsonFile with deleteFileOnError', () => {
  let baseDir;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-json-delete-'));
    fs.mkdirSync(path.join(baseDir, 'studies'), { recursive: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('deletes a file that fails the gunzip step, and keeps a file that has an I/O error', async () => {
    const corruptPath = path.join(baseDir, 'studies', 'corrupt.json.gz');
    const goodPath = path.join(baseDir, 'studies', 'good.json.gz');
    fs.writeFileSync(corruptPath, 'not gzip data');
    fs.writeFileSync(goodPath, 'content that the mock read never returns');
    const reader = new FileDicomWebReader(baseDir);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(
      await reader.readJsonFile('studies', 'corrupt.json', { deleteFileOnError: true })
    ).toBeUndefined();
    expect(fs.existsSync(corruptPath)).toBe(false);

    jest.spyOn(reader, 'openInputStream').mockImplementation(async () => {
      const stream = new PassThrough();
      setImmediate(() =>
        stream.destroy(Object.assign(new Error('stale file handle'), { code: 'ESTALE' }))
      );
      return stream;
    });
    expect(
      await reader.readJsonFile('studies', 'good.json', { deleteFileOnError: true })
    ).toBeUndefined();
    expect(fs.existsSync(goodPath)).toBe(true);
  });
});
