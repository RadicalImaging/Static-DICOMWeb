/**
 * The result of an upload after the commit of its instance: a storage error after the commit
 * does not report the stored instance as failed (issue #144).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { once } from 'events';
import express from 'express';
import { createVerboseLog } from '@radicalimaging/static-wado-util';
import { seriesSummary, studyMain } from '@radicalimaging/create-dicomweb';
import {
  streamPostController,
  completePostController,
} from '../../lib/controllers/server/streamPostController.mjs';

createVerboseLog(false, { quiet: true });

const DICOM_FILE = path.resolve(__dirname, '../../../static-wado-creator/dicom/jpeg8bit.dcm');
const BOUNDARY = 'stow-commit-test-boundary';

describe('an upload after the commit of its instance', () => {
  let root;
  let server;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'stow-commit-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (server) {
      await new Promise(resolve => server.close(resolve));
      server = undefined;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  // Test 36. The user experience must have this: a refused delete of a derived file does not
  // report the stored instance as failed, and the other derived files are still deleted
  it('reports the instance as stored when the delete of a derived file fails', async () => {
    const app = express();
    app.post(
      '/studies',
      streamPostController({ rootDir: root, disableSummary: true }),
      completePostController
    );
    server = app.listen(0);
    await once(server, 'listening');
    const upload = async () => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/studies`, {
        method: 'POST',
        headers: {
          'content-type': `multipart/related; type="application/dicom"; boundary=${BOUNDARY}`,
          accept: 'application/dicom+json',
        },
        body: Buffer.concat([
          Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
          fs.readFileSync(DICOM_FILE),
          Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
        ]),
      });
      return { status: response.status, body: await response.json() };
    };

    await upload();
    const studiesDir = path.join(root, 'studies');
    const [studyUID] = fs.readdirSync(studiesDir).filter(name => name !== 'temp');
    const seriesRoot = path.join(studiesDir, studyUID, 'series');
    const [seriesUID] = fs
      .readdirSync(seriesRoot)
      .filter(name => fs.statSync(path.join(seriesRoot, name)).isDirectory());
    await seriesSummary(root, studyUID, seriesUID);
    await studyMain(studyUID, { dicomdir: root });
    // The older layout: the series metadata is a directory, which the delete removes with rmSync
    const seriesMetadata = path.join(seriesRoot, seriesUID, 'metadata');
    fs.rmSync(`${seriesMetadata}.gz`);
    fs.mkdirSync(seriesMetadata);
    fs.writeFileSync(path.join(seriesMetadata, 'index.json.gz'), 'old');
    const rmSync = fs.rmSync;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(fs, 'rmSync').mockImplementation((target, ...rest) => {
      if (String(target) === seriesMetadata) {
        throw Object.assign(new Error('io'), { code: 'EIO' });
      }
      return rmSync(target, ...rest);
    });

    const { status, body } = await upload();

    expect(status).toBe(200);
    expect(body['00081198']).toBeUndefined();
    expect(body['00081199'].Value).toHaveLength(1);
    expect(fs.existsSync(path.join(seriesRoot, 'index.json.gz'))).toBe(false);
    expect(fs.existsSync(path.join(studiesDir, studyUID, 'index.json.gz'))).toBe(false);
  });
});
