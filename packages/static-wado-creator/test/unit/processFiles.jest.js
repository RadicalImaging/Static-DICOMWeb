const fs = require('fs');
const os = require('os');
const path = require('path');
const { default: StaticWado } = require('../../lib');
const { Failure } = require('../../lib/util/resultsReport');
const { createVerboseLog } = require('@radicalimaging/static-wado-util');

createVerboseLog(false, { quiet: true });

describe('StaticWado.processFiles', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-files-'));
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

  // Test 59. The user experience must have this (SQR-U5): a bulk import reports an unreadable
  // path as failed, and imports the next path
  it('reports an unreadable path as failed, and imports the next path', async () => {
    const failures = [];
    const imported = [];
    const importer = {
      showProgress: false,
      updateProgress: () => {},
      importBinaryDicom: async (stream, { file }) => {
        for await (const chunk of stream);
        imported.push(path.basename(file));
      },
      callback: {
        failure: (reason, message, file) => failures.push([reason, path.basename(file)]),
      },
    };

    await StaticWado.prototype.processFiles.call(importer, [dir], {});

    expect(failures).toEqual([['Not readable', 'a.dcm']]);
    expect(imported).toEqual(['b.dcm']);
  });

  /** An importer with the real executeCommand, processFiles and Failure; `fail` maps a base name to its import error */
  const cliImporter = (options, fail = {}) => ({
    options,
    showProgress: false,
    updateProgress: () => {},
    processFiles: StaticWado.prototype.processFiles,
    close: async () => {},
    importBinaryDicom: async (stream, { file }) => {
      for await (const chunk of stream);
      if (fail[path.basename(file)]) throw fail[path.basename(file)];
    },
    callback: { clearResults: () => {}, writeResults: () => {}, failure: Failure(options) },
  });

  // CLI test 1. The user experience must have this (CLI-U1): an unreadable path gives a
  // non-zero exit code, also when the other paths import
  it('exits with 1 after an unreadable path', async () => {
    const exitCode = process.exitCode;
    try {
      await StaticWado.prototype.executeCommand.call(cliImporter({}), [dir]);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = exitCode;
    }
  });

  // CLI test 2. The API must do this (CLI-U2): --delete-failed deletes a file with bad data,
  // and keeps an unreadable path and a file that failed with a system error
  it('deletes only a file with bad data for --delete-failed', async () => {
    fs.writeFileSync(path.join(dir, 'c.dcm'), 'data');
    const fail = {
      'b.dcm': new Error('not DICOM'),
      'c.dcm': Object.assign(new Error('i/o'), { code: 'EIO' }),
    };
    const exitCode = process.exitCode;
    try {
      await StaticWado.prototype.executeCommand.call(cliImporter({ deleteFailed: true }, fail), [dir]);
    } finally {
      process.exitCode = exitCode;
    }
    expect(fs.readdirSync(dir).sort()).toEqual(['a.dcm', 'c.dcm']);
  });
});
