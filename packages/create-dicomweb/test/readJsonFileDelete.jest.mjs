import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import zlib from 'zlib';
import { StorageUnavailableError } from '@radicalimaging/static-wado-util';
import { FileDicomWebReader, createBuildReader } from '../lib/instance/FileDicomWebReader.mjs';

/**
 * readJsonFile with deleteFileOnError deletes a corrupt file only. A correct file can give
 * a transient I/O error (ESTALE on a network file system), and must stay. An existence check
 * classifies its errors in the same way (SQR-D3).
 */
describe('FileDicomWebReader errors: deleteFileOnError and throwOnIoError', () => {
  let baseDir;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-json-delete-'));
    fs.mkdirSync(path.join(baseDir, 'studies'), { recursive: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  // The API must do this (SQR-D9)
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

  // The API must do this (SQR-D3): a missing path is "missing" in both modes, and an I/O error
  // throws only from the reader of a build
  it.each([
    ['ENOENT', false],
    ['ENOTDIR', false],
    ['EACCES', true],
  ])('classifies a failed existence check with %s', (code, ioError) => {
    for (const name of ['statSync', 'lstatSync']) {
      jest.spyOn(fs, name).mockImplementation(() => {
        throw Object.assign(new Error(code), { code });
      });
    }

    expect(new FileDicomWebReader(baseDir).fileExists('studies', 'x.json')).toBe(false);
    const check = () => createBuildReader(baseDir).fileExists('studies', 'x.json');
    if (ioError) {
      expect(check).toThrow(StorageUnavailableError);
    } else {
      expect(check()).toBe(false);
    }
  });

  // The API must do this (SQR-D3): the reader of a build never counts an unreadable file as
  // missing data: a read error that is not an I/O error, and a corrupt file that stays, throw
  it('throws from the reader of a build for a read error with no code, and for a corrupt file that stays', async () => {
    const goodPath = path.join(baseDir, 'studies', 'good.json.gz');
    fs.writeFileSync(goodPath, 'content that the mock read never returns');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(FileDicomWebReader.prototype, 'openInputStream').mockImplementation(async () => {
      const stream = new PassThrough();
      setImmediate(() => stream.destroy(new Error('program error')));
      return stream;
    });
    expect(await new FileDicomWebReader(baseDir).readJsonFile('studies', 'good.json')).toBe(
      undefined
    );
    await expect(createBuildReader(baseDir).readJsonFile('studies', 'good.json')).rejects.toThrow(
      'program error'
    );
    jest.restoreAllMocks();

    const corruptPath = path.join(baseDir, 'studies', 'corrupt.json.gz');
    fs.writeFileSync(corruptPath, 'not gzip data');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest
      .spyOn(fs.promises, 'unlink')
      .mockRejectedValue(Object.assign(new Error('not permitted'), { code: 'EPERM' }));
    await expect(
      createBuildReader(baseDir).readJsonFile('studies', 'corrupt.json', {
        deleteFileOnError: true,
      })
    ).rejects.toThrow(StorageUnavailableError);
  });

  // The API must do this: the older layout <name>.gz/index.json.gz is read as <name>
  it('reads a file in the older layout with a compressed directory name', async () => {
    const dir = path.join(baseDir, 'studies', 'metadata.gz');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.json.gz'), zlib.gzipSync('[{"a":1}]'));

    expect(await createBuildReader(baseDir).readJsonFile('studies', 'metadata')).toEqual([
      { a: 1 },
    ]);
  });
});
