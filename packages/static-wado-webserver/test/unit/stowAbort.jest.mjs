/**
 * An upload that stores instances and then aborts (completePostController does not run) must
 * not leave stale derived files (SQR-D5 of docs/specs/derived-data-updates.md).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { once } from 'events';
import express from 'express';
import { createVerboseLog } from '@radicalimaging/static-wado-util';
import { seriesSummary, studyMain, generationTracker } from '@radicalimaging/create-dicomweb';
import { streamPostController } from '../../lib/controllers/server/streamPostController.mjs';

createVerboseLog(false, { quiet: true });

const DICOM_FILE = path.resolve(__dirname, '../../../static-wado-creator/dicom/jpeg8bit.dcm');
const BOUNDARY = 'stow-abort-test-boundary';

describe('an upload that aborts after it stores an instance', () => {
  let root;
  let server;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'stow-abort-'));
  });

  afterEach(() => {
    server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  // The API must do this (SQR-D5): each stored instance makes its derived files stale at once
  it('deletes the derived files of the series and the study, and changes the generation', async () => {
    const app = express();
    app.post(
      '/studies',
      streamPostController({ rootDir: root, disableSummary: true }),
      async (req, res) => {
        // completePostController does not run, as after a client disconnect
        await Promise.allSettled(req.uploadListenerPromises);
        res.status(500).end();
      }
    );
    server = app.listen(0);
    await once(server, 'listening');
    const upload = () =>
      fetch(`http://127.0.0.1:${server.address().port}/studies`, {
        method: 'POST',
        headers: {
          'content-type': `multipart/related; type="application/dicom"; boundary=${BOUNDARY}`,
        },
        body: Buffer.concat([
          Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
          fs.readFileSync(DICOM_FILE),
          Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
        ]),
      });

    expect((await upload()).status).toBe(500);
    const studiesDir = path.join(root, 'studies');
    const [studyUID] = fs.readdirSync(studiesDir).filter(name => name !== 'temp');
    const seriesRoot = path.join(studiesDir, studyUID, 'series');
    const [seriesUID] = fs
      .readdirSync(seriesRoot)
      .filter(name => fs.statSync(path.join(seriesRoot, name)).isDirectory());
    await seriesSummary(root, studyUID, seriesUID);
    await studyMain(studyUID, { dicomdir: root });
    const derivedFiles = [
      path.join(seriesRoot, seriesUID, 'metadata.gz'),
      path.join(seriesRoot, seriesUID, 'series-singleton.json.gz'),
      path.join(seriesRoot, 'index.json.gz'),
      path.join(studiesDir, studyUID, 'index.json.gz'),
    ];
    derivedFiles.forEach(file => expect(fs.existsSync(file)).toBe(true));
    const generation = generationTracker.current(studyUID);

    expect((await upload()).status).toBe(500);

    derivedFiles.forEach(file => expect(fs.existsSync(file)).toBe(false));
    expect(generationTracker.current(studyUID)).toBeGreaterThan(generation);
  });
});
