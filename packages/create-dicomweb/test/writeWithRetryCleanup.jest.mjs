import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeWithRetry, writeMultipleWithRetry } from '../lib/instance/writeWithRetry.mjs';
import { FileDicomWebWriter } from '../lib/instance/FileDicomWebWriter.mjs';
import { instanceFromStream } from '../lib/instance/instanceFromStream.mjs';
import { instanceFromFile, storeInstanceFiles } from '../lib/commands/instanceMain.mjs';
import { removeOrphanTempFiles } from '../lib/instance/removeOrphanTempFiles.mjs';

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

  /** Makes the write of the file whose final name ends with `name` fail with EIO */
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

  // The API must do this (SQR-D3): the studies list write gives a StorageUnavailableError for
  // an I/O error of the open and of the rename, so the request gets 503
  it.each([
    ['the open', 'openSync', 'EMFILE'],
    ['the rename', 'renameSync', 'EBUSY'],
  ])('gives a StorageUnavailableError when %s of writeWithRetry fails', async (_, call, code) => {
    jest.spyOn(fs, call).mockImplementation(() => {
      throw Object.assign(new Error(code), { code });
    });

    await expect(
      writeWithRetry({
        informationProvider: {},
        baseDir,
        openStream: writes[0].openStream,
        generateData: async () => '[]',
        label: 'a.json',
      })
    ).rejects.toMatchObject({ name: 'StorageUnavailableError', code });
    jest.restoreAllMocks();
    expect(await files()).toEqual([]);
  });

  // The API must do this (SQR-D2): an upload whose metadata file cannot open leaves no temp
  // file of its frames
  it('leaves no temp file when the metadata of an instance cannot open', async () => {
    const dicomFilePath = path.resolve(
      process.cwd().endsWith('create-dicomweb')
        ? process.cwd()
        : path.resolve(process.cwd(), 'packages/create-dicomweb'),
      '../static-wado-creator/dicom/jpeg8bit.dcm'
    );
    const openSync = fs.openSync;
    jest.spyOn(fs, 'openSync').mockImplementation((target, ...rest) => {
      if (String(target).endsWith('-metadata.gz')) {
        throw Object.assign(new Error('no space'), { code: 'ENOSPC' });
      }
      return openSync(target, ...rest);
    });

    await expect(
      instanceFromStream(fs.createReadStream(dicomFilePath), {
        dicomdir: baseDir,
        writerOptions: { baseDir, deferFinalMove: true },
      })
    ).rejects.toMatchObject({ code: 'ENOSPC' });
    jest.restoreAllMocks();
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

  // The API must do this (SQR-D2): when a moved file cannot be deleted, the old files of the
  // round are deleted, so a file of the level is missing, and the next request builds it
  it('deletes the old files when a moved file of a failed commit cannot be deleted', async () => {
    const studiesDir = path.join(baseDir, 'studies');
    fs.mkdirSync(studiesDir, { recursive: true });
    for (const name of ['a.json.gz', 'b.json.gz']) {
      fs.writeFileSync(path.join(studiesDir, name), 'old');
    }
    const rename = fs.renameSync;
    let renames = 0;
    jest.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      if (++renames === 2) {
        throw Object.assign(new Error('io'), { code: 'EIO' });
      }
      return rename(...args);
    });
    const rm = fs.rmSync;
    jest.spyOn(fs, 'rmSync').mockImplementation((target, ...rest) => {
      if (String(target).endsWith('a.json.gz')) {
        throw Object.assign(new Error('read-only'), { code: 'EROFS' });
      }
      return rm(target, ...rest);
    });

    await expect(
      writeMultipleWithRetry({
        informationProvider: {},
        baseDir,
        writes,
        generatePayload: async () => ({}),
      })
    ).rejects.toMatchObject({ name: 'StorageUnavailableError', code: 'EIO' });

    expect(await files()).toEqual(['a.json.gz']);
  });
});

describe('an upload of an instance after a failure', () => {
  const dicomFilePath = path.resolve(
    process.cwd().endsWith('create-dicomweb')
      ? process.cwd()
      : path.resolve(process.cwd(), 'packages/create-dicomweb'),
    '../static-wado-creator/dicom/jpeg8bit.dcm'
  );
  let baseDir;

  const upload = options =>
    instanceFromStream(fs.createReadStream(dicomFilePath), {
      dicomdir: baseDir,
      writerOptions: { baseDir, deferFinalMove: true },
      ...options,
    });

  /** The stored files of the instance, relative to its directory, with their contents */
  const instanceFiles = instanceDir =>
    Object.fromEntries(
      fs
        .readdirSync(instanceDir, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => {
          const file = path.join(entry.parentPath ?? entry.path, entry.name);
          return [path.relative(instanceDir, file), fs.readFileSync(file).toString('base64')];
        })
    );

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instance-failure-'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  // Test 33. The user experience must have this: a failed new upload of a stored instance
  // keeps its stored frames, and a committed upload replaces the other frame variant
  it('keeps the stored frames when a new upload of the instance fails before commit', async () => {
    const { information } = await upload();
    const instanceDir = path.join(
      baseDir,
      'studies',
      information.studyInstanceUid,
      'series',
      information.seriesInstanceUid,
      'instances',
      information.sopInstanceUid
    );
    const stored = instanceFiles(instanceDir);
    expect(Object.keys(stored)).toContain(path.join('frames', '1.mht'));

    await expect(
      upload({
        validateInstance: async () => {
          throw new Error('rejected');
        },
      })
    ).rejects.toThrow('rejected');
    expect(instanceFiles(instanceDir)).toEqual(stored);

    const otherVariant = path.join(instanceDir, 'frames', '1.mht.gz');
    fs.writeFileSync(otherVariant, 'old variant');
    await upload();
    expect(fs.existsSync(otherVariant)).toBe(false);
    expect(fs.existsSync(path.join(instanceDir, 'frames', '1.mht'))).toBe(true);
  });

  // Test 34. The user experience must have this: an upload never reports success for an
  // instance whose metadata or frame write failed, and commits no file of that instance
  it.each([['metadata.gz'], ['1.mht']])(
    'fails the instance, and commits nothing, when the write of %s fails',
    async name => {
      failWriteOf(name);
      await expect(upload()).rejects.toMatchObject({ code: 'ENOSPC' });
      expect(await storedFiles()).toEqual([]);
    }
  );

  // Test 39. The user experience must have this: the CLI (instanceFromFile, no writer
  // options) commits no file of an instance whose frame write failed
  it('commits nothing from the CLI when the write of a frame fails', async () => {
    failWriteOf('1.mht');
    await expect(instanceFromFile(dicomFilePath, { dicomdir: baseDir })).rejects.toMatchObject({
      code: 'ENOSPC',
    });
    expect(await storedFiles()).toEqual([]);
  });

  // Test 40. The API must do this: the CLI store gives the files that it did not store, so
  // the instance and create commands can exit with a non-zero code
  it('gives the files that the CLI did not store', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instance-files-'));
    try {
      fs.copyFileSync(dicomFilePath, path.join(sourceDir, 'good.dcm'));
      fs.writeFileSync(path.join(sourceDir, 'bad.dcm'), 'not a DICOM file');
      const { studyUIDs, failedFiles } = await storeInstanceFiles([sourceDir], {
        dicomdir: baseDir,
      });
      expect(studyUIDs.size).toBe(1);
      expect(failedFiles.map(file => path.basename(file))).toEqual(['bad.dcm']);
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  // Test 46. The user experience must have this (SQR-U5): a CLI input path that does not
  // exist is a file that was not stored, so the command exits with a non-zero code
  it('gives a missing input path of the CLI as not stored', async () => {
    const missing = path.join(baseDir, 'no-such-file.dcm');
    const { failedFiles } = await storeInstanceFiles([missing], { dicomdir: baseDir });
    expect(failedFiles).toEqual([missing]);
  });

  /** Makes the write of the file whose final name ends with `name` fail with ENOSPC */
  function failWriteOf(name) {
    const closeStream = FileDicomWebWriter.prototype.closeStream;
    jest
      .spyOn(FileDicomWebWriter.prototype, 'closeStream')
      .mockImplementation(async function closeStreamSpy(streamKey) {
        if (this.openStreams.get(streamKey)?.filepath?.endsWith(name)) {
          const error = Object.assign(new Error('no space'), { code: 'ENOSPC' });
          this.recordStreamError(streamKey, error, true);
        }
        return closeStream.call(this, streamKey);
      });
  }

  /** The files under baseDir, after a wait, so a temp file that closes late is also seen */
  async function storedFiles() {
    await new Promise(resolve => setTimeout(resolve, 100));
    return fs
      .readdirSync(baseDir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name);
  }
});

describe('removeOrphanTempFiles', () => {
  let baseDir;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-temp-'));
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  // Test 42. The API must do this (SQR-D19): the cleanup removes only the old temp files of
  // the writer, and keeps a recent temp file (a running upload) and each other file
  it('removes only the temp files of the writer that are older than the limit', async () => {
    const hour = 60 * 60 * 1000;
    const now = Date.now();
    const files = {
      'studies/1.2.3/temp/1700000000000-abc123-1.mht': now - 25 * hour,
      'studies/temp/1700000000000-def456-index.json.gz': now - 25 * hour,
      'studies/1.2.3/temp/1700000000001-ghi789-metadata.gz': now - hour,
      'studies/1.2.3/temp/notes.txt': now - 25 * hour,
      'studies/1.2.3/series/1.2.3.4/metadata.gz': now - 25 * hour,
    };
    for (const [name, mtime] of Object.entries(files)) {
      const file = path.join(baseDir, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'data');
      fs.utimesSync(file, new Date(mtime), new Date(mtime));
    }

    expect(await removeOrphanTempFiles(baseDir, { maxAgeMs: 24 * hour, now })).toBe(2);

    const kept = Object.keys(files).filter(name => fs.existsSync(path.join(baseDir, name)));
    expect(kept).toEqual([
      'studies/1.2.3/temp/1700000000001-ghi789-metadata.gz',
      'studies/1.2.3/temp/notes.txt',
      'studies/1.2.3/series/1.2.3.4/metadata.gz',
    ]);
  });
});
