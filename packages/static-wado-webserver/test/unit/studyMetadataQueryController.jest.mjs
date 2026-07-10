import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { studyMetadataQueryController } from '../../lib/controllers/server/studyMetadataQueryController.mjs';

const gzip = promisify(zlib.gzip);

describe('studyMetadataQueryController', () => {
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'static-wado-study-metadata-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('combines series metadata arrays for the standard study metadata endpoint', async () => {
    const studyUID = '1.2.3';
    const seriesRoot = path.join(root, 'studies', studyUID, 'series');
    const expected = [
      { '00080018': { vr: 'UI', Value: ['1.2.3.1.1'] } },
      { '00080018': { vr: 'UI', Value: ['1.2.3.2.1'] } },
    ];

    for (const [index, metadata] of expected.entries()) {
      const seriesDirectory = path.join(seriesRoot, `1.2.3.${index + 1}`);
      await fs.mkdir(seriesDirectory, { recursive: true });
      await fs.writeFile(
        path.join(seriesDirectory, 'metadata.gz'),
        await gzip(JSON.stringify([metadata]))
      );
    }

    const req = {
      params: { studyUID },
      staticWadoPath: `/studies/${studyUID}/metadata`,
    };
    const res = {
      statusCode: 200,
      contentType: undefined,
      body: undefined,
      status(value) {
        this.statusCode = value;
        return this;
      },
      type(value) {
        this.contentType = value;
        return this;
      },
      send(value) {
        this.body = value;
        return this;
      },
      json(value) {
        this.body = value;
        return this;
      },
    };
    const next = jest.fn();

    await studyMetadataQueryController(root, { createIndexOnDemand: false })(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe('application/dicom+json');
    expect(res.body).toEqual(expected);
  });
});
