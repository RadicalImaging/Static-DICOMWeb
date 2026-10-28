import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { studyMetadataQueryController } from '../../lib/controllers/server/studyMetadataQueryController.mjs';

const gzip = promisify(zlib.gzip);

describe('studyMetadataQueryController', () => {
  let root;
  const studyUID = '1.2.3';
  const expected = [
    { '00080018': { vr: 'UI', Value: ['1.2.3.1.1'] } },
    { '00080018': { vr: 'UI', Value: ['1.2.3.2.1'] } },
  ];

  const seriesDirectory = index => path.join(root, 'studies', studyUID, 'series', `1.2.3.${index}`);

  /** Stores the series metadata of `expected`, as series 1.2.3.1 and 1.2.3.2 */
  const storeSeries = async () => {
    for (const [index, metadata] of expected.entries()) {
      await fs.mkdir(seriesDirectory(index + 1), { recursive: true });
      await fs.writeFile(
        path.join(seriesDirectory(index + 1), 'metadata.gz'),
        await gzip(JSON.stringify([metadata]))
      );
    }
  };

  const request = () => ({
    params: { studyUID },
    staticWadoPath: `/studies/${studyUID}/metadata`,
  });

  const response = () => ({
    statusCode: 200,
    contentType: undefined,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
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
  });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'static-wado-study-metadata-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('combines series metadata arrays for the standard study metadata endpoint', async () => {
    await storeSeries();
    const res = response();
    const next = jest.fn();

    await studyMetadataQueryController(root, { createIndexOnDemand: false })(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe('application/dicom+json');
    expect(res.body).toEqual(expected);
  });

  // User experience (SQR-U1, SQR-D3 rule 4): a corrupt series metadata that the server cannot
  // delete gives 503, and not a 200 response that leaves out the series
  it('answers 503 when a corrupt series metadata cannot be deleted', async () => {
    await storeSeries();
    await fs.writeFile(path.join(seriesDirectory(2), 'metadata.gz'), 'not gzip');
    await fs.mkdir(path.join(seriesDirectory(2), 'instances', '1.2.3.2.1'), { recursive: true });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(fs, 'unlink').mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    const res = response();
    const next = jest.fn();

    await studyMetadataQueryController(root, {})(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.headers['Retry-After']).toBe('10');
  });
});
