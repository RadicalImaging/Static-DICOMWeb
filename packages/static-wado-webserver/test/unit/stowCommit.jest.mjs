/**
 * The result of an upload: the status and the failure reasons of the response, and the
 * result after the commit of an instance (issue #144, SQR-U5).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import http from 'node:http';
import { once } from 'events';
import express from 'express';
import { createVerboseLog } from '@radicalimaging/static-wado-util';
import { seriesSummary, studyMain } from '@radicalimaging/create-dicomweb';
import {
  streamPostController,
  completePostController,
} from '../../lib/controllers/server/streamPostController.mjs';
import { stowFailureReason } from '../../lib/util/stowResponseBuilder.mjs';
import createMissingThumbnail from '../../lib/controllers/server/createMissingThumbnail.mjs';

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
    server.closeAllConnections();
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

  // Test 47. The user experience must have this (SQR-U5): a thumbnail request after an upload
  // gets a new thumbnail, and not 404, also when the upload deleted the series files
  it('makes a new instance thumbnail after the instance is stored again', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const first = await upload();
    const sopInstanceUID = first.body['00081199'].Value[0]['00081155'].Value[0];
    const { studyUID, seriesRoot, seriesUID } = storedSeries();
    await seriesSummary(root, studyUID, seriesUID);
    await upload();
    const instanceThumbnail = path.join(
      seriesRoot,
      seriesUID,
      'instances',
      sopInstanceUID,
      'thumbnail'
    );
    expect(fs.existsSync(path.join(seriesRoot, seriesUID, 'metadata.gz'))).toBe(false);

    const req = {
      params: { studyUID, seriesUID, instanceUID: sopInstanceUID },
      staticWadoPath: `/${path.relative(root, instanceThumbnail).split(path.sep).join('/')}`,
    };
    const res = {
      headersSent: false,
      status: jest.fn(() => res),
      json: jest.fn(),
      send: jest.fn(),
    };
    res.setHeader = jest.fn();
    const next = jest.fn();
    await createMissingThumbnail({ dir: root })(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(fs.existsSync(instanceThumbnail)).toBe(true);
  });

  // Test 51. The API must do this (SQR-D17): the build of a thumbnail request obeys the server
  // param studyIndex, as the builds of a query do
  it('does not add the study to the studies list for a series thumbnail with studyIndex false', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await upload();
    const { studiesDir, studyUID, seriesRoot, seriesUID } = storedSeries();
    const studiesIndex = path.join(studiesDir, 'index.json.gz');
    fs.writeFileSync(studiesIndex, zlib.gzipSync('[]'));
    const seriesThumbnail = path.join(seriesRoot, seriesUID, 'thumbnail');

    const req = {
      params: { studyUID, seriesUID },
      staticWadoPath: `/${path.relative(root, seriesThumbnail).split(path.sep).join('/')}`,
    };
    const res = { headersSent: false, status: jest.fn(() => res), json: jest.fn() };
    res.setHeader = jest.fn();
    const next = jest.fn();
    await createMissingThumbnail({ dir: root, studyIndex: false })(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(fs.existsSync(path.join(studiesDir, studyUID, 'index.json.gz'))).toBe(true);
    expect(JSON.parse(zlib.gunzipSync(fs.readFileSync(studiesIndex)))).toEqual([]);
  });

  // Test 38. The user experience must have this: the status of the response and the Failure
  // Reason of each failed instance obey SQR-U5 (PS3.18 Table 10.5.3-1 and Table I.2-2). A
  // storage outage gives 503, and a failed item names its instance when the parse read it.
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
    const [item] = response.body['00081198'].Value;
    expect(item['00081155']?.Value?.[0]).toMatch(/^1\.3\.12\./);
  });

  // Test 38 (continued). A part that is not DICOM gives C000, and the request gives 202
  it('answers 202 with C000 for a part that is not DICOM', async () => {
    const mixed = await upload([fs.readFileSync(DICOM_FILE), Buffer.from('not a DICOM file')]);
    expect(mixed.status).toBe(202);
    expect(mixed.body['00081199'].Value).toHaveLength(1);
    expect(failureReasons(mixed.body)).toEqual([0xc000]);
  });

  // Test 45. The user experience must have this (SQR-U5): a body that ends without its closing
  // boundary reports the stored instance as stored, and the incomplete part as failed (C000)
  it('reports each instance when the body ends without its closing boundary', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dicom = fs.readFileSync(DICOM_FILE);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/studies`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/related; type="application/dicom"; boundary=${BOUNDARY}`,
        accept: 'application/dicom+json',
      },
      body: Buffer.concat([
        Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
        dicom,
        Buffer.from(`\r\n--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
        dicom.subarray(0, 1000),
      ]),
    });
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body['00081199'].Value).toHaveLength(1);
    expect(failureReasons(body)).toEqual([0xc000]);
  });

  /** One part of a STOW-RS body, with the data of the DICOM file or a part of it */
  const part = (data = fs.readFileSync(DICOM_FILE)) =>
    Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
      data,
      Buffer.from('\r\n'),
    ]);

  /**
   * A body of `complete` parts and a part that arrives in two halves: `start` ends in the
   * middle of the last part, and `rest` has the rest of it, one more part, and the end
   */
  const bodyInTwo = complete => {
    const dicom = fs.readFileSync(DICOM_FILE);
    const half = dicom.length >> 1;
    return {
      start: Buffer.concat([
        ...Array(complete).fill(part()),
        part(dicom.subarray(0, half)),
      ]).subarray(0, -2),
      rest: Buffer.concat([
        dicom.subarray(half),
        Buffer.from('\r\n'),
        part(),
        Buffer.from(`--${BOUNDARY}--\r\n`),
      ]),
    };
  };

  /**
   * Fails the open of the metadata file of an instance with EIO, after `okCount` opens that
   * succeed, and records the path of each open
   */
  const failMetadataOpen = (okCount = 0) => {
    const opened = [];
    let metadataOpens = 0;
    const openSync = fs.openSync;
    jest.spyOn(fs, 'openSync').mockImplementation((target, ...rest) => {
      opened.push(String(target));
      if (String(target).endsWith('-metadata.gz') && metadataOpens++ >= okCount) {
        throw Object.assign(new Error('EIO'), { code: 'EIO' });
      }
      return openSync(target, ...rest);
    });
    return opened;
  };

  /**
   * Sends `start`, and holds the rest of the body until the response comes. Then sends `rest`,
   * and waits 300 ms. Gives the response, the body state at the response, and the number of
   * file opens at the response.
   */
  const uploadUntilResponse = (start, rest, opened) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          method: 'POST',
          hostname: '127.0.0.1',
          port: server.address().port,
          path: '/studies',
          headers: {
            'content-type': `multipart/related; type="application/dicom"; boundary=${BOUNDARY}`,
            accept: 'application/dicom+json',
          },
        },
        res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const bodyEnded = req.writableEnded;
            const opensAtResponse = opened.length;
            req.end(rest);
            setTimeout(() => {
              req.destroy();
              resolve({
                status: res.statusCode,
                retryAfter: res.headers['retry-after'],
                body: JSON.parse(Buffer.concat(chunks).toString()),
                bodyEnded,
                opensAtResponse,
              });
            }, 300);
          });
        }
      );
      req.on('error', reject);
      req.write(start);
    });

  // Test 63. The user experience must have this (SQR-U5, SQR-D21): when the storage cannot
  // write the first instance, the upload gets 503 with Retry-After before the end of the
  // body. The part that the stop cuts fails with 0110, a part that did not arrive gets no
  // item, and no later part writes a file.
  it('stops the upload at the first instance that the storage cannot write', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const opened = failMetadataOpen();
    const { start, rest } = bodyInTwo(1);

    const response = await uploadUntilResponse(start, rest, opened);

    expect(response.bodyEnded).toBe(false);
    expect(response.status).toBe(503);
    expect(response.retryAfter).toBe('10');
    expect(response.body['00081199']).toBeUndefined();
    expect(failureReasons(response.body)).toEqual([0x0110, 0x0110]);
    expect(opened).toHaveLength(response.opensAtResponse);
  });

  // Test 64. The user experience must have this (SQR-U5, SQR-D21): an instance that the storage
  // stored before the stop is reported as stored, and the upload gets 202 with the failed
  // instances. The later parts are not written.
  it('answers 202 when the storage fails after an instance was stored', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const opened = failMetadataOpen(1);
    const { start, rest } = bodyInTwo(2);

    const response = await uploadUntilResponse(start, rest, opened);

    expect(response.bodyEnded).toBe(false);
    expect(response.status).toBe(202);
    expect(response.retryAfter).toBeUndefined();
    const [stored] = response.body['00081199'].Value;
    expect(stored['00081155'].Value[0]).toMatch(/^1\.3\.12\./);
    expect(failureReasons(response.body)).toEqual([0x0110, 0x0110]);
    expect(opened).toHaveLength(response.opensAtResponse);
    const { seriesRoot, seriesUID } = storedSeries();
    expect(
      fs.existsSync(
        path.join(seriesRoot, seriesUID, 'instances', stored['00081155'].Value[0], 'metadata.gz')
      )
    ).toBe(true);
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
