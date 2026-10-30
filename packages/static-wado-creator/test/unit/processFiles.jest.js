const fs = require('fs');
const os = require('os');
const path = require('path');
const { default: StaticWado } = require('../../lib');

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
});
