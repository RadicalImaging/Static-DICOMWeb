import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeWithRetry, writeMultipleWithRetry } from '../lib/instance/writeWithRetry.mjs';

/**
 * A build that fails leaves no temp file, and no part of its commit (SQR-D2: a missing file
 * is safe). The failure can come from the data step or from a rename of the commit.
 */
describe('write functions after a failure', () => {
  let baseDir;

  const files = () =>
    fs
      .readdirSync(baseDir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name);

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
      'writeMultipleWithRetry, when the second rename throws',
      () => {
        const rename = fs.renameSync;
        let renames = 0;
        jest.spyOn(fs, 'renameSync').mockImplementation((...args) => {
          if (++renames === 2) {
            throw Object.assign(new Error('busy'), { code: 'EBUSY' });
          }
          return rename(...args);
        });
        return writeMultipleWithRetry({
          informationProvider: {},
          baseDir,
          writes,
          generatePayload: async () => ({}),
        });
      },
    ],
  ])('%s leaves no file', async (_, write) => {
    await expect(write()).rejects.toThrow();
    expect(files()).toEqual([]);
  });
});
