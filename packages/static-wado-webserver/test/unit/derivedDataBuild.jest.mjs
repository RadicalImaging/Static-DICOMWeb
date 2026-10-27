/**
 * Builds of missing derived files on the request path (SQR-I1 to SQR-I5 of
 * docs/implementation/series-index-rebuild.md). Each test names the requirements that it checks.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { once } from 'events';
import { PassThrough } from 'stream';
import express from 'express';
import { createJobManager, createVerboseLog } from '@radicalimaging/static-wado-util';
import {
  FileDicomWebReader,
  FileDicomWebWriter,
  seriesSummary,
  studyMain,
  indexSummary,
  generationTracker,
} from '@radicalimaging/create-dicomweb';
import { seriesQueryController } from '../../lib/controllers/server/seriesQueryController.mjs';
import {
  studyQueryController,
  ensureStudyLevel,
  ensureSeriesLevel,
} from '../../lib/controllers/server/indexOnDemandController.mjs';
import { deleteStaleSummaries } from '../../lib/controllers/server/deleteStaleSummaries.mjs';
import { indexingStaticController } from '../../lib/controllers/server/staticControllers.mjs';

createVerboseLog(false, { quiet: true });

const STUDY = '1.2.3';
const SERIES = ['1.2.3.1', '1.2.3.2'];
const INSTANCES_PER_SERIES = 2;
const NUMBER_OF_SERIES_RELATED_INSTANCES = '00201209';
const SERIES_INSTANCE_UID = '0020000E';

function instanceJson(studyUID, seriesUID, sopUID, seriesNumber, instanceNumber) {
  return {
    '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Test^Patient' }] },
    '0020000D': { vr: 'UI', Value: [studyUID] },
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
  function storeInstance(seriesUID, instanceNumber, studyUID = STUDY) {
    const seriesNumber = SERIES.indexOf(seriesUID) + 1 || 9;
    const sopUID = `${seriesUID}.${instanceNumber}`;
    const filePath = path.join(
      root,
      'studies',
      studyUID,
      'series',
      seriesUID,
      'instances',
      sopUID,
      'metadata.gz'
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const instance = instanceJson(studyUID, seriesUID, sopUID, seriesNumber, instanceNumber);
    fs.writeFileSync(filePath, zlib.gzipSync(JSON.stringify([instance])));
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

  /** Makes each read whose path includes `pathPart` fail with ESTALE until the returned function is called */
  function failReadsWithEstale(pathPart) {
    const original = FileDicomWebReader.prototype.openInputStream;
    const spy = jest
      .spyOn(FileDicomWebReader.prototype, 'openInputStream')
      .mockImplementation(async function openInputStreamSpy(relativePath, filename) {
        if (!`${relativePath}/${filename}`.includes(pathPart)) {
          return original.call(this, relativePath, filename);
        }
        const stream = new PassThrough();
        setImmediate(() =>
          stream.destroy(Object.assign(new Error('stale file handle'), { code: 'ESTALE' }))
        );
        return stream;
      });
    return () => spy.mockRestore();
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

  // The API must do this (SQR-D3, SQR-D12): an unknown study starts no job and writes nothing
  it('answers 404 for an unknown study, with no job and no directory', async () => {
    await startServer(createJobManager());
    const runSpy = jest.spyOn(jobs, 'run');

    const response = await fetch(`${baseUrl}/studies/9.9.9/series`);

    expect(response.status).toBe(404);
    expect(runSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, 'studies', '9.9.9'))).toBe(false);
  });

  // The API must do this (SQR-D4): the study query repairs a missing series index
  it('builds a missing series index on a study query when the study index.json exists', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());

    const response = await fetch(`${baseUrl}/studies?StudyInstanceUID=${STUDY}`);

    expect(response.status).toBe(200);
    expect(fs.existsSync(seriesIndexPath())).toBe(true);
  });

  // The API must do this (SQR-D2, SQR-D3): a missing study index.json comes back when
  // series/index.json is current
  it('builds a missing study index.json on a study query when the series index exists', async () => {
    await startServer(createJobManager());
    const studyIndexPath = path.join(studyDir(), 'index.json.gz');
    fs.rmSync(studyIndexPath);

    const response = await fetch(`${baseUrl}/studies?StudyInstanceUID=${STUDY}`);

    expect(response.status).toBe(200);
    expect((await response.json())[0]['0020000D'].Value).toEqual([STUDY]);
    expect(fs.existsSync(studyIndexPath)).toBe(true);
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
    // The studies list is a best-effort helper, and the upload keeps it
    expect(fs.existsSync(path.join(root, 'studies', 'index.json.gz'))).toBe(true);

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
    await startServer(createJobManager({ roundDelayMs: 10 }));
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

  // The API must do this (SQR-D6): an upload into one series does not stop the commit of a
  // build of a different series of the same study, and stops the commit of the study level
  it('commits a series build while an upload goes into a different series of the study', async () => {
    const [built, uploaded] = SERIES;
    const builtDir = path.join(studyDir(), 'series', built);
    fs.rmSync(path.join(builtDir, 'metadata.gz'));
    let stored = false;
    spyOnReads((relativePath, filename) => {
      // seriesSummary reads the instance metadata of the built series
      if (relativePath.includes(`/${built}/instances/`) && !stored) {
        stored = true;
        storeInstance(uploaded, INSTANCES_PER_SERIES + 1);
        deleteStaleSummaries(root, new Map([[`${STUDY}&${uploaded}`, {}]]));
      }
    });
    const studyGeneration = generationTracker.current(STUDY);

    const result = await seriesSummary(root, STUDY, built);

    expect(stored).toBe(true);
    expect(result.committed).toBe(true);
    expect(fs.existsSync(path.join(builtDir, 'metadata.gz'))).toBe(true);
    const study = await studyMain(STUDY, { dicomdir: root, generation: studyGeneration });
    expect(study.committed).toBe(false);
  });

  // The API must do this (SQR-D3): a series with no readable data is not read again on each
  // request, and new data in the series starts a new build
  it('does not build a series with no readable data again until new data arrives', async () => {
    const jobManager = createJobManager();
    const broken = '1.2.3.8';
    const instanceDir = path.join(studyDir(), 'series', broken, 'instances', `${broken}.1`);
    fs.mkdirSync(instanceDir, { recursive: true });
    fs.writeFileSync(path.join(instanceDir, 'metadata.gz'), 'not gzip');
    const reads = spyOnReads();
    const instanceReads = () => reads.filter(read => read.includes(`/${broken}/instances/`));

    await ensureSeriesLevel(root, STUDY, broken, { jobs: jobManager });
    const firstReads = instanceReads().length;
    await ensureSeriesLevel(root, STUDY, broken, { jobs: jobManager });

    expect(firstReads).toBeGreaterThan(0);
    expect(instanceReads()).toHaveLength(firstReads);

    storeInstance(broken, 2);
    deleteStaleSummaries(root, new Map([[`${STUDY}&${broken}`, {}]]));
    await ensureSeriesLevel(root, STUDY, broken, { jobs: jobManager });

    expect(fs.existsSync(path.join(studyDir(), 'series', broken, 'series-singleton.json.gz'))).toBe(
      true
    );
  });

  // User experience (SQR-U1) and the API (SQR-D3): an I/O error fails the series build and
  // records nothing, so the series is built when the storage recovers, with no upload
  it('fails a series build on an I/O error, and builds the series after the storage recovers', async () => {
    const jobManager = createJobManager();
    const [series] = SERIES;
    const seriesDir = path.join(studyDir(), 'series', series);
    deleteStaleSummaries(root, new Map([[`${STUDY}&${series}`, {}]]));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const recover = failReadsWithEstale(`${series}.1/metadata`);

    await expect(ensureSeriesLevel(root, STUDY, series, { jobs: jobManager })).rejects.toMatchObject(
      { code: 'ESTALE' }
    );
    expect(fs.existsSync(path.join(seriesDir, 'series-singleton.json.gz'))).toBe(false);
    expect(fs.readdirSync(seriesDir).filter(name => name !== 'instances')).toEqual([]);

    recover();
    await ensureSeriesLevel(root, STUDY, series, { jobs: jobManager });
    const singleton = readGzJson(path.join(seriesDir, 'series-singleton.json.gz'));
    expect(singleton[0][NUMBER_OF_SERIES_RELATED_INSTANCES].Value).toEqual([INSTANCES_PER_SERIES]);
  });

  // The API must do this (SQR-D3): an I/O error on a series file fails the study build, and
  // no series index that leaves out that series is stored
  it('stores no series index that leaves out a series with an I/O error', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());
    jest.spyOn(console, 'error').mockImplementation(() => {});
    failReadsWithEstale(`${SERIES[1]}/series-singleton.json`);

    const response = await fetch(`${baseUrl}/studies/${STUDY}/series`);

    expect(response.status).toBe(500);
    expect(fs.existsSync(seriesIndexPath())).toBe(false);
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

  // The API must do this (SQR-D10): `createdicomweb study --force` writes the study files
  // again, and does not build a series whose files exist
  it('builds the study files again with force, and no series', async () => {
    const singletonPath = path.join(studyDir(), 'series', SERIES[0], 'series-singleton.json.gz');
    const singleton = readGzJson(singletonPath);
    singleton[0]['00080060'] = { vr: 'CS', Value: ['MR'] };
    fs.writeFileSync(singletonPath, zlib.gzipSync(JSON.stringify(singleton)));

    await studyMain(STUDY, { dicomdir: root });
    expect(readGzJson(path.join(studyDir(), 'index.json.gz'))[0]['00080061'].Value).toEqual(['CT']);

    await studyMain(STUDY, { dicomdir: root, force: true });
    expect(readGzJson(path.join(studyDir(), 'index.json.gz'))[0]['00080061'].Value.sort()).toEqual([
      'CT',
      'MR',
    ]);
    // A series build would write the modality of the instance metadata again
    expect(readGzJson(singletonPath)[0]['00080060'].Value).toEqual(['MR']);
  });

  // User experience (SQR-U4): the studies list lists each stored study, and an update of a
  // study that the list has does not rewrite the list
  it('adds a new study to the studies index, and leaves the index alone on the next upload', async () => {
    const studiesIndexPath = path.join(root, 'studies', 'index.json.gz');
    const studyUIDsOf = () =>
      readGzJson(studiesIndexPath)
        .map(study => study['0020000D'].Value[0])
        .sort();
    const newStudy = '1.2.4';
    const newSeries = '1.2.4.1';
    const upload = async instanceNumber => {
      storeInstance(newSeries, instanceNumber, newStudy);
      deleteStaleSummaries(root, new Map([[`${newStudy}&${newSeries}`, {}]]));
      // The updateStudy message handler does this call
      await ensureStudyLevel(root, newStudy, { jobs: createJobManager(), background: true });
    };

    await upload(1);
    expect(studyUIDsOf()).toEqual([STUDY, newStudy]);

    const before = fs.readFileSync(studiesIndexPath);
    const mtimeBefore = fs.statSync(studiesIndexPath).mtimeMs;
    await upload(2);
    expect(fs.readFileSync(studiesIndexPath).equals(before)).toBe(true);
    expect(fs.statSync(studiesIndexPath).mtimeMs).toBe(mtimeBefore);
  });
});
