/**
 * Builds of missing derived files on the request path (SQR-I1 to SQR-I5 of
 * docs/implementation/series-index-rebuild.md). Each test names the requirements that it checks.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { once } from 'events';
import express from 'express';
import { createJobManager, createVerboseLog } from '@radicalimaging/static-wado-util';
import {
  FileDicomWebReader,
  FileDicomWebWriter,
  seriesSummary,
  studyMain,
  indexSummary,
} from '@radicalimaging/create-dicomweb';
import { seriesQueryController } from '../../lib/controllers/server/seriesQueryController.mjs';
import { studyQueryController } from '../../lib/controllers/server/indexOnDemandController.mjs';
import { deleteStaleSummaries } from '../../lib/controllers/server/deleteStaleSummaries.mjs';
import { indexingStaticController } from '../../lib/controllers/server/staticControllers.mjs';

createVerboseLog(false, { quiet: true });

const STUDY = '1.2.3';
const SERIES = ['1.2.3.1', '1.2.3.2'];
const INSTANCES_PER_SERIES = 2;
const NUMBER_OF_SERIES_RELATED_INSTANCES = '00201209';
const SERIES_INSTANCE_UID = '0020000E';

function instanceJson(seriesUID, sopUID, seriesNumber, instanceNumber) {
  return {
    '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Test^Patient' }] },
    '0020000D': { vr: 'UI', Value: [STUDY] },
    '0020000E': { vr: 'UI', Value: [seriesUID] },
    '00080018': { vr: 'UI', Value: [sopUID] },
    '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] },
    '00080060': { vr: 'CS', Value: ['CT'] },
    '00200011': { vr: 'IS', Value: [seriesNumber] },
    '00200013': { vr: 'IS', Value: [instanceNumber] },
  };
}

function readGzJson(filePath) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf-8'));
}

describe('builds of missing derived files', () => {
  let root;
  let server;
  let baseUrl;
  let jobs;

  const studyDir = () => path.join(root, 'studies', STUDY);
  const seriesIndexPath = () => path.join(studyDir(), 'series', 'index.json.gz');

  /** Stores the instance metadata of one instance, as an upload does */
  function storeInstance(seriesUID, instanceNumber) {
    const seriesNumber = SERIES.indexOf(seriesUID) + 1 || 9;
    const sopUID = `${seriesUID}.${instanceNumber}`;
    const filePath = path.join(studyDir(), 'series', seriesUID, 'instances', sopUID, 'metadata.gz');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      zlib.gzipSync(JSON.stringify([instanceJson(seriesUID, sopUID, seriesNumber, instanceNumber)]))
    );
  }

  /** Stores the instances, and builds the series, study and studies levels */
  async function storeAndBuildStudy() {
    for (const seriesUID of SERIES) {
      for (let i = 1; i <= INSTANCES_PER_SERIES; i++) {
        storeInstance(seriesUID, i);
      }
      await seriesSummary(root, STUDY, seriesUID);
    }
    await studyMain(STUDY, { dicomdir: root });
    await indexSummary(root, []);
  }

  async function startServer(jobManager) {
    jobs = jobManager;
    const params = { jobManager };
    const app = express();
    app.use((req, res, next) => {
      req.staticWadoPath = req.path;
      next();
    });
    app.get('/studies', studyQueryController(root, params));
    app.get('/studies/:studyUID/series', seriesQueryController(root, params));
    app.use(indexingStaticController(root));
    server = app.listen(0);
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  const seriesUIDsOf = list => list.map(series => series[SERIES_INSTANCE_UID].Value[0]).sort();

  /** Spies on the reads of the builds; returns the list of `relativePath/filename` reads */
  function spyOnReads(onRead) {
    const reads = [];
    const original = FileDicomWebReader.prototype.readJsonFile;
    jest
      .spyOn(FileDicomWebReader.prototype, 'readJsonFile')
      .mockImplementation(async function readJsonFileSpy(relativePath, filename, options) {
        reads.push(`${relativePath}/${filename}`);
        onRead?.(relativePath, filename);
        return original.call(this, relativePath, filename, options);
      });
    return reads;
  }

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'derived-data-build-'));
    await storeAndBuildStudy();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await jobs?.whenIdle();
    server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  // User experience (SQR-U1): a missing series index gives 200 and all series, and is stored
  it('builds a missing series index on a series query, and serves the stored file the next time', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());

    const response = await fetch(`${baseUrl}/studies/${STUDY}/series`);
    expect(response.status).toBe(200);
    expect(seriesUIDsOf(await response.json())).toEqual(SERIES);
    expect(fs.existsSync(seriesIndexPath())).toBe(true);

    // The API must do this (SQR-D1, SQR-D11): a stored file is served with no build
    const reads = spyOnReads();
    const openSpy = jest.spyOn(FileDicomWebWriter.prototype, '_openStream');
    const second = await fetch(`${baseUrl}/studies/${STUDY}/series`);
    expect(second.status).toBe(200);
    expect(seriesUIDsOf(await second.json())).toEqual(SERIES);
    expect(reads).toEqual([]);
    expect(openSpy).not.toHaveBeenCalled();
  });

  // The API must do this (SQR-D7): concurrent queries share one build
  it('runs one study build for two concurrent series queries', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());
    const reads = spyOnReads();

    const responses = await Promise.all([
      fetch(`${baseUrl}/studies/${STUDY}/series`),
      fetch(`${baseUrl}/studies/${STUDY}/series`),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(seriesUIDsOf(await response.json())).toEqual(SERIES);
    }
    // studySummary reads the stored series index first, one time for each build
    expect(reads.filter(read => read === `studies/${STUDY}/series/index.json`)).toHaveLength(1);
  });

  // The API must do this (SQR-D4): the study query repairs a missing series index
  it('builds a missing series index on a study query when the study index.json exists', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());

    const response = await fetch(`${baseUrl}/studies?StudyInstanceUID=${STUDY}`);

    expect(response.status).toBe(200);
    expect(fs.existsSync(seriesIndexPath())).toBe(true);
  });

  // The API must do this (SQR-D4, SQR-D5): an upload deletes the stale files, and the
  // next build rebuilds only the changed series
  it('rebuilds only the changed series after an upload', async () => {
    await startServer(createJobManager());
    const [changed, unchanged] = SERIES;
    storeInstance(changed, INSTANCES_PER_SERIES + 1);

    deleteStaleSummaries(root, new Map([[`${STUDY}&${changed}`, {}]]));

    const changedDir = path.join(studyDir(), 'series', changed);
    expect(fs.existsSync(path.join(changedDir, 'metadata.gz'))).toBe(false);
    expect(fs.existsSync(path.join(changedDir, 'series-singleton.json.gz'))).toBe(false);
    expect(fs.existsSync(path.join(changedDir, 'instances', 'index.json.gz'))).toBe(false);
    expect(fs.existsSync(seriesIndexPath())).toBe(false);
    expect(fs.existsSync(path.join(studyDir(), 'index.json.gz'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'studies', 'index.json.gz'))).toBe(false);

    const reads = spyOnReads();
    const response = await fetch(`${baseUrl}/studies/${STUDY}/series`);

    expect(response.status).toBe(200);
    const counts = Object.fromEntries(
      (await response.json()).map(series => [
        series[SERIES_INSTANCE_UID].Value[0],
        series[NUMBER_OF_SERIES_RELATED_INSTANCES].Value[0],
      ])
    );
    expect(counts).toEqual({
      [changed]: INSTANCES_PER_SERIES + 1,
      [unchanged]: INSTANCES_PER_SERIES,
    });
    expect(reads.some(read => read.includes(`/${changed}/instances/`))).toBe(true);
    expect(reads.some(read => read.includes(`/${unchanged}/instances/`))).toBe(false);
  });

  // User experience (SQR-U1) and the API (SQR-D6, SQR-D7, SQR-D8): data that arrives during
  // a build is missing from the first response, and is in the index that the next round commits
  it('responds with the first round, and commits the next round, when a series arrives during a study build', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());
    fs.rmSync(path.join(studyDir(), 'index.json.gz'));
    const newSeries = '1.2.3.9';
    let uploaded = false;
    spyOnReads((relativePath, filename) => {
      // studySummary scanned the series directories, and now reads their singletons
      if (filename === 'series-singleton.json' && !uploaded) {
        uploaded = true;
        storeInstance(newSeries, 1);
        deleteStaleSummaries(root, new Map([[`${STUDY}&${newSeries}`, {}]]));
      }
    });

    const response = await fetch(`${baseUrl}/studies/${STUDY}/series`);

    expect(response.status).toBe(200);
    expect(seriesUIDsOf(await response.json())).toEqual(SERIES);
    await jobs.whenIdle();
    expect(seriesUIDsOf(readGzJson(seriesIndexPath()))).toEqual([...SERIES, newSeries]);
  });

  // User experience (SQR-U3) and the API (SQR-D11, SQR-D14): a full queue rejects only
  // the requests that need a build
  it('answers 503 with Retry-After when the queue is full, and 200 when the file exists', async () => {
    const jobManager = createJobManager({ maxRunning: 1, maxQueued: 1, retryAfterSeconds: 7 });
    await startServer(jobManager);
    let release;
    const hold = new Promise(resolve => {
      release = resolve;
    });
    const blockers = [
      jobManager.run(
        'blocker:running',
        () => true,
        () => hold
      ),
      jobManager.run(
        'blocker:queued',
        () => true,
        () => hold
      ),
    ];

    const stored = await fetch(`${baseUrl}/studies/${STUDY}/series`);
    expect(stored.status).toBe(200);

    fs.rmSync(seriesIndexPath());
    const missing = await fetch(`${baseUrl}/studies/${STUDY}/series`);
    expect(missing.status).toBe(503);
    expect(missing.headers.get('retry-after')).toBe('7');

    release({ committed: true });
    await Promise.all(blockers);
  });
});
