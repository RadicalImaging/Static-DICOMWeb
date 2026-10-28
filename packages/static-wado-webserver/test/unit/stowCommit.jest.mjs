/**
 * The result of an upload: the status and the failure reasons of the response, and the
 * result after the commit of an instance (issue #144, SQR-U5).
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
import { stowFailureReason } from '../../lib/util/stowResponseBuilder.mjs';

createVerboseLog(false, { quiet: true });

const DICOM_FILE = path.resolve(__dirname, '../../../static-wado-creator/dicom/jpeg8bit.dcm');
const BOUNDARY = 'stow-commit-test-boundary';

describe('the result of an upload', () => {
  let root;
  let server;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'stow-commit-'));
    const app = express();
    app.post(
      '/studies',
      streamPostController({ rootDir: root, disableSummary: true }),
      completePostController
    );
    server = app.listen(0);
    await once(server, 'listening');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** Sends one STOW-RS request with one part for each buffer */
  const upload = async (parts = [fs.readFileSync(DICOM_FILE)]) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/studies`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/related; type="application/dicom"; boundary=${BOUNDARY}`,
        accept: 'application/dicom+json',
      },
      body: Buffer.concat([
        ...parts.flatMap(part => [
          Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
          part,
          Buffer.from('\r\n'),
        ]),
        Buffer.from(`--${BOUNDARY}--\r\n`),
      ]),
    });
    return {
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
      body: await response.json(),
    };
  };

  /** The Failure Reason values of the response */
  const failureReasons = body =>
    (body['00081198']?.Value ?? []).map(item => item['00081197'].Value[0]);

  /** The study and series directories of the one stored series */
  const storedSeries = () => {
    const studiesDir = path.join(root, 'studies');
    const [studyUID] = fs.readdirSync(studiesDir).filter(name => name !== 'temp');
    const seriesRoot = path.join(studiesDir, studyUID, 'series');
    const [seriesUID] = fs
      .readdirSync(seriesRoot)
      .filter(name => fs.statSync(path.join(seriesRoot, name)).isDirectory());
    return { studiesDir, studyUID, seriesRoot, seriesUID };
  };

  // Test 36. The user experience must have this: a refused delete of a derived file does not
  // report the stored instance as failed, and the other derived files are still deleted
  it('reports the instance as stored when the delete of a derived file fails', async () => {
    await upload();
    const { studiesDir, studyUID, seriesRoot, seriesUID } = storedSeries();
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

  // Test 41. The user experience must have this: a new upload of an instance makes its stored
  // instance thumbnail and the series thumbnail stale, so the server makes them again
  it('deletes the instance and series thumbnails when an instance is stored again', async () => {
    const first = await upload();
    const sopInstanceUID = first.body['00081199'].Value[0]['00081155'].Value[0];
    const { seriesRoot, seriesUID } = storedSeries();
    const seriesThumbnail = path.join(seriesRoot, seriesUID, 'thumbnail');
    const instanceDir = path.join(seriesRoot, seriesUID, 'instances', sopInstanceUID);
    const instanceThumbnail = path.join(instanceDir, 'thumbnail');
    fs.writeFileSync(seriesThumbnail, 'old');
    fs.writeFileSync(instanceThumbnail, 'old');

    expect((await upload()).status).toBe(200);
    expect(fs.existsSync(seriesThumbnail)).toBe(false);
    expect(fs.existsSync(instanceThumbnail)).toBe(false);
  });

  // Test 38. The user experience must have this: the status of the response and the Failure
  // Reason of each failed instance obey SQR-U5 (PS3.18 Table 10.5.3-1 and Table I.2-2). A
  // storage outage gives 503.
  it.each([
    ['ENOSPC', 503, 0xa700],
    ['EIO', 503, 0x0110],
    ['EISDIR', 409, 0x0110],
  ])('answers an upload whose metadata open fails with %s', async (code, status, reason) => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const openSync = fs.openSync;
    jest.spyOn(fs, 'openSync').mockImplementation((target, ...rest) => {
      if (String(target).endsWith('-metadata.gz')) {
        throw Object.assign(new Error(code), { code });
      }
      return openSync(target, ...rest);
    });
    const response = await upload();
    expect(response.status).toBe(status);
    expect(response.retryAfter).toBe(status === 503 ? '10' : null);
    expect(failureReasons(response.body)).toEqual([reason]);
  });

  // Test 38 (continued). A part that is not DICOM gives C000, and the request gives 202
  it('answers 202 with C000 for a part that is not DICOM', async () => {
    const mixed = await upload([fs.readFileSync(DICOM_FILE), Buffer.from('not a DICOM file')]);
    expect(mixed.status).toBe(202);
    expect(mixed.body['00081199'].Value).toHaveLength(1);
    expect(failureReasons(mixed.body)).toEqual([0xc000]);
  });

  // Test 44. The API must do this (SQR-U5): an error that the server causes never gives C000
  it.each([
    ['a stopped instance', Object.assign(new Error('stopped'), { code: 'ABORTED' })],
    ['a drain timeout', new Error('Stream did not complete within 60000ms')],
    ['a stream error', Object.assign(new Error('closed'), { code: 'ERR_STREAM_PREMATURE_CLOSE' })],
  ])('gives 0110 for %s', (_, error) => {
    expect(stowFailureReason(error)).toBe(0x0110);
  });
});
