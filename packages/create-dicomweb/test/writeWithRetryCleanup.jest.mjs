import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeWithRetry, writeMultipleWithRetry } from '../lib/instance/writeWithRetry.mjs';
import { FileDicomWebWriter } from '../lib/instance/FileDicomWebWriter.mjs';

/**
 * A build that fails leaves no temp file, and no part of its commit: an old file stays, or
 * the file is missing, which is safe (SQR-D2). The failure can come from the data step or
 * from a rename of the commit.
 */
describe('write functions after a failure', () => {
  let baseDir;

  /** The files under baseDir, after a wait, so a temp file that opens late is also seen */
  const files = async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return fs
      .readdirSync(baseDir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  };

  const writes = ['a.json', 'b.json'].map(name => ({
    openStream: writer => writer.openStream('studies', name, { gzip: true }),
    getData: () => '[]',
    label: name,
  }));

  /** A data step that reads for a moment (so the temp files are open), and then fails */
  const failAfterRead = async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
    throw new Error('read failed');
  };

  /** Makes the write of the file whose final name ends with 
ame fail with EIO */
  const failWriteOf = name => {
    const closeStream = FileDicomWebWriter.prototype.closeStream;
    jest
      .spyOn(FileDicomWebWriter.prototype, 'closeStream')
      .mockImplementation(async function closeStreamSpy(streamKey) {
        if (this.openStreams.get(streamKey)?.filepath?.endsWith(name)) {
          this.recordStreamError(streamKey, Object.assign(new Error('io'), { code: 'EIO' }), true);
        }
        return closeStream.call(this, streamKey);
      });
  };

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-cleanup-'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  // The API must do this (SQR-D2, SQR-D3)
  it.each([
    [
      'writeWithRetry, when the data step throws',
      () =>
        writeWithRetry({
          informationProvider: {},
          baseDir,
          openStream: writes[0].openStream,
          generateData: failAfterRead,
          label: 'a.json',
        }),
    ],
    [
      'writeMultipleWithRetry, when the data step throws',
      () =>
        writeMultipleWithRetry({
          informationProvider: {},
          baseDir,
          writes,
          generatePayload: failAfterRead,
        }),
    ],
    [
      'writeMultipleWithRetry, when the data step throws at once',
      () =>
        writeMultipleWithRetry({
          informationProvider: {},
          baseDir,
          writes,
          generatePayload: async () => {
            throw Object.assign(new Error('read failed'), { code: 'EIO' });
          },
        }),
    ],
    [
      'writeWithRetry, when the write fails',
      () => {
        failWriteOf('a.json.gz');
        return writeWithRetry({
          informationProvider: {},
          baseDir,
          openStream: writes[0].openStream,
          generateData: async () => '[]',
          label: 'a.json',
        });
      },
    ],
  ])('%s leaves no file', async (_, write) => {
    await expect(write()).rejects.toThrow();
    expect(await files()).toEqual([]);
  });

  // The API must do this (SQR-D3): an I/O error when a stream opens gives a
  // StorageUnavailableError, and leaves no file
  it('gives a StorageUnavailableError when a stream cannot open', async () => {
    const failingWrites = [
      writes[0],
      {
        ...writes[1],
        openStream: () => {
          throw Object.assign(new Error('no space'), { code: 'ENOSPC' });
        },
      },
    ];

    await expect(
      writeMultipleWithRetry({
        informationProvider: {},
        baseDir,
        writes: failingWrites,
        generatePayload: async () => ({}),
      })
    ).rejects.toMatchObject({ name: 'StorageUnavailableError', code: 'ENOSPC' });
    expect(await files()).toEqual([]);
  });

  // The API must do this (SQR-D3): a failed write of one file stops the commit of the round,
  // and gives a StorageUnavailableError
  it('does not commit a round when the write of one file fails', async () => {
    failWriteOf('b.json.gz');

    await expect(
      writeMultipleWithRetry({
        informationProvider: {},
        baseDir,
        writes,
        generatePayload: async () => ({}),
      })
    ).rejects.toMatchObject({ name: 'StorageUnavailableError', code: 'EIO' });
    expect(await files()).toEqual([]);
  });

  // The API must do this (SQR-D2): a failed rename keeps each old file that did not get its
  // new version, and deletes each new file that moved before the failure
  it.each([
    ['the first', 1, ['a.json.gz', 'b.json.gz']],
    ['the second', 2, ['b.json.gz']],
  ])('keeps the old files when %s rename of a commit throws', async (_, failingRename, kept) => {
    const studiesDir = path.join(baseDir, 'studies');
    fs.mkdirSync(studiesDir, { recursive: true });
    for (const name of ['a.json.gz', 'b.json.gz']) {
      fs.writeFileSync(path.join(studiesDir, name), 'old');
    }
    const rename = fs.renameSync;
    let renames = 0;
    jest.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      if (++renames === failingRename) {
        throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      }
      return rename(...args);
    });

    await expect(
      writeMultipleWithRetry({
        informationProvider: {},
        baseDir,
        writes,
        generatePayload: async () => ({}),
      })
    ).rejects.toMatchObject({ name: 'StorageUnavailableError', code: 'EBUSY' });

    expect((await files()).sort()).toEqual(kept);
    kept.forEach(name => expect(fs.readFileSync(path.join(studiesDir, name), 'utf8')).toBe('old'));
  });
});
