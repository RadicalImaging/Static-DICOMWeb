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
  ensureStudiesLevel,
} from '../../lib/controllers/server/indexOnDemandController.mjs';
import { studyMetadataQueryController } from '../../lib/controllers/server/studyMetadataQueryController.mjs';
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
    app.get('/studies/:studyUID/metadata', studyMetadataQueryController(root, params));
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

  /** Makes each read whose path includes `pathPart` fail with `code` until the returned function is called */
  function failReadsWithEstale(pathPart, code = 'ESTALE') {
    const original = FileDicomWebReader.prototype.openInputStream;
    const spy = jest
      .spyOn(FileDicomWebReader.prototype, 'openInputStream')
      .mockImplementation(async function openInputStreamSpy(relativePath, filename) {
        if (!`${relativePath}/${filename}`.includes(pathPart)) {
          return original.call(this, relativePath, filename);
        }
        const stream = new PassThrough();
        setImmediate(() =>
          stream.destroy(Object.assign(new Error('read failed'), { code }))
        );
        return stream;
      });
    return () => spy.mockRestore();
  }

  /** Makes each stat of a path that `matches` fail with EACCES until the returned function is called */
  function failStatsWithEacces(matches) {
    const spies = ['statSync', 'lstatSync'].map(name => {
      const original = fs[name];
      return jest.spyOn(fs, name).mockImplementation((target, ...rest) => {
        if (matches(String(target))) {
          throw Object.assign(new Error('permission denied'), { code: 'EACCES', syscall: name });
        }
        return original(target, ...rest);
      });
    });
    return () => spies.forEach(spy => spy.mockRestore());
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

  // Test 1 (and test 2 below). User experience (SQR-U1, SQR-D2, SQR-D3): a missing series index gives 200 and
  // all series, and is stored
  it('builds a missing series index on a series query, and serves the stored file the next time', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());

    const response = await fetch(`${baseUrl}/studies/${STUDY}/series`);
    expect(response.status).toBe(200);
    expect(seriesUIDsOf(await response.json())).toEqual(SERIES);
    expect(fs.existsSync(seriesIndexPath())).toBe(true);

    // Test 2. The API must do this (SQR-D1, SQR-D11): a stored file is served with no build
    const reads = spyOnReads();
    const openSpy = jest.spyOn(FileDicomWebWriter.prototype, '_openStream');
    const second = await fetch(`${baseUrl}/studies/${STUDY}/series`);
    expect(second.status).toBe(200);
    expect(seriesUIDsOf(await second.json())).toEqual(SERIES);
    expect(reads).toEqual([]);
    expect(openSpy).not.toHaveBeenCalled();
  });

  // Test 3. The API must do this (SQR-D7): concurrent queries share one build
  it('runs one study build for two concurrent series queries', async () => {
    const jobManager = createJobManager();
    await startServer(jobManager);
    fs.rmSync(seriesIndexPath());
    // Hold the build until the second request calls the job manager, so both overlap
    let bothArrived;
    const arrived = new Promise(resolve => {
      bothArrived = resolve;
    });
    const run = jobManager.run;
    let runs = 0;
    jest.spyOn(jobManager, 'run').mockImplementation((...args) => {
      if (++runs === 2) {
        bothArrived();
      }
      return run(...args);
    });
    const reads = [];
    const readJsonFile = FileDicomWebReader.prototype.readJsonFile;
    jest
      .spyOn(FileDicomWebReader.prototype, 'readJsonFile')
      .mockImplementation(async function readJsonFileSpy(relativePath, filename, options) {
        reads.push(`${relativePath}/${filename}`);
        if (filename === 'series-singleton.json') {
          await arrived;
        }
        return readJsonFile.call(this, relativePath, filename, options);
      });

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

  // Test 15. The API must do this (SQR-D11, SQR-D12): an unknown study starts no job and writes nothing
  it('answers 404 for an unknown study, with no job and no directory', async () => {
    await startServer(createJobManager());
    const runSpy = jest.spyOn(jobs, 'run');

    const response = await fetch(`${baseUrl}/studies/9.9.9/series`);

    expect(response.status).toBe(404);
    expect(runSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, 'studies', '9.9.9'))).toBe(false);
  });

  // Test 4. The API must do this (SQR-D4): the study query repairs a missing series index
  it('builds a missing series index on a study query when the study index.json exists', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());

    const response = await fetch(`${baseUrl}/studies?StudyInstanceUID=${STUDY}`);

    expect(response.status).toBe(200);
    expect(fs.existsSync(seriesIndexPath())).toBe(true);
  });

  // Test 11. The API must do this (SQR-D2, SQR-D3): a missing study index.json comes back when
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

  // Test 5. The API must do this (SQR-D4, SQR-D5): an upload deletes the stale files, and the
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
    const openSpy = jest.spyOn(FileDicomWebWriter.prototype, '_openStream');
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
    // The study build reads at most one instance of any series for the study attributes
    const unchangedReads = reads.filter(read => read.includes(`/${unchanged}/instances/`));
    expect(unchangedReads.length).toBeLessThan(INSTANCES_PER_SERIES);
    // No file of the unchanged series is opened for a write
    const unchangedWrites = openSpy.mock.calls.filter(([relativePath]) =>
      String(relativePath).includes(`/${unchanged}`)
    );
    expect(unchangedWrites).toEqual([]);
  });

  // Test 6. User experience (SQR-U1, SQR-D6, SQR-D7): data that arrives during
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

  // Test 14. The API must do this (SQR-D6): an upload into one series does not stop the commit of a
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

  // Test 16. The API must do this (SQR-D3): a series with no readable data is not read again on each
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

  // Test 17. User experience (SQR-U3, SQR-D3): an I/O error of a read or an existence check in
  // the series build fails the build and records nothing, so the series is built when the
  // storage recovers, with no upload
  it.each([
    // Every instance fails, so a lenient reader would record the series as having no data
    ['a read', series => failReadsWithEstale(`${series}/instances/`), 'ESTALE'],
    [
      'an existence check',
      series =>
        failStatsWithEacces(target =>
          target.startsWith(path.join(studyDir(), 'series', series, 'instances') + path.sep)
        ),
      'EACCES',
    ],
    [
      'the existence check of the instances directory',
      series =>
        failStatsWithEacces(
          target => target === path.join(studyDir(), 'series', series, 'instances')
        ),
      'EACCES',
    ],
  ])(
    'fails a series build when %s has an I/O error, and builds the series after the storage recovers',
    async (_, fail, code) => {
      const jobManager = createJobManager();
      const [series] = SERIES;
      const seriesDir = path.join(studyDir(), 'series', series);
      deleteStaleSummaries(root, new Map([[`${STUDY}&${series}`, {}]]));
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const recover = fail(series);

      await expect(
        ensureSeriesLevel(root, STUDY, series, { jobs: jobManager })
      ).rejects.toMatchObject({ name: 'StorageUnavailableError', code });
      expect(fs.existsSync(path.join(seriesDir, 'series-singleton.json.gz'))).toBe(false);
      expect(fs.readdirSync(seriesDir).filter(name => name !== 'instances')).toEqual([]);

      recover();
      await ensureSeriesLevel(root, STUDY, series, { jobs: jobManager });
      const singleton = readGzJson(path.join(seriesDir, 'series-singleton.json.gz'));
      expect(singleton[0][NUMBER_OF_SERIES_RELATED_INSTANCES].Value).toEqual([
        INSTANCES_PER_SERIES,
      ]);
    }
  );

  // Test 18. User experience (SQR-U3, SQR-D3): an I/O error on a series file answers 503,
  // and no series index that leaves out that series is stored
  it.each([
    ['a read', () => failReadsWithEstale(`${SERIES[1]}/series-singleton.json`)],
    [
      'an existence check',
      () =>
        failStatsWithEacces(target =>
          target.startsWith(path.join(studyDir(), 'series', SERIES[1], 'series-singleton.json'))
        ),
    ],
  ])(
    'answers 503 and stores no series index when %s of a series file has an I/O error',
    async (_, fail) => {
      await startServer(createJobManager());
      fs.rmSync(seriesIndexPath());
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      fail();

      const response = await fetch(`${baseUrl}/studies/${STUDY}/series`);

      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('10');
      expect(fs.existsSync(seriesIndexPath())).toBe(false);
    }
  );

  // Test 19. User experience (SQR-U3, SQR-U4): a failed directory listing answers 503, and
  // stores no empty studies list
  it.each([
    ['the studies list', () => '/studies', () => path.join(root, 'studies'), true],
    [
      'the study metadata',
      () => `/studies/${STUDY}/metadata`,
      () => path.join(studyDir(), 'series'),
      false,
    ],
  ])(
    'answers 503 for %s when a directory listing has an I/O error',
    async (_, url, listed, writesList) => {
      await startServer(createJobManager());
      const studiesIndexPath = path.join(root, 'studies', 'index.json.gz');
      fs.rmSync(studiesIndexPath);
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const readdir = fs.promises.readdir;
      jest
        .spyOn(fs.promises, 'readdir')
        .mockImplementation((dir, ...rest) =>
          String(dir) === listed()
            ? Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' }))
            : readdir(dir, ...rest)
        );

      const response = await fetch(`${baseUrl}${url()}`);

      expect(response.status).toBe(503);
      if (writesList) {
        expect(fs.existsSync(studiesIndexPath)).toBe(false);
      }
    }
  );

  // Test 21. User experience (SQR-U1, SQR-D7): a study build that starts after an upload does
  // not take the series round that started before the upload. It waits for that round, builds
  // the series again, and its response and its commit have the new instance
  it('gives a study build that starts after an upload the data of that upload', async () => {
    const jobManager = createJobManager({ roundDelayMs: 10 });
    jobs = jobManager;
    const [series] = SERIES;
    deleteStaleSummaries(root, new Map([[`${STUDY}&${series}`, {}]]));
    let study;
    let joined;
    const studyJoined = new Promise(resolve => {
      joined = resolve;
    });
    const listDirectories = FileDicomWebReader.prototype.listDirectories;
    jest
      .spyOn(FileDicomWebReader.prototype, 'listDirectories')
      .mockImplementation(async function listDirectoriesSpy(relativePath) {
        const result = await listDirectories.call(this, relativePath);
        // The study build checks the series (seriesNeedsBuild), and then joins its round
        if (study && relativePath.endsWith(`/${series}/instances`)) {
          setImmediate(joined);
        }
        return result;
      });
    const readJsonFile = FileDicomWebReader.prototype.readJsonFile;
    jest
      .spyOn(FileDicomWebReader.prototype, 'readJsonFile')
      .mockImplementation(async function readJsonFileSpy(relativePath, filename, options) {
        if (relativePath.includes(`/${series}/instances/`) && !study) {
          storeInstance(series, INSTANCES_PER_SERIES + 1);
          deleteStaleSummaries(root, new Map([[`${STUDY}&${series}`, {}]]));
          study = ensureStudyLevel(root, STUDY, { jobs: jobManager });
          await studyJoined;
        }
        return readJsonFile.call(this, relativePath, filename, options);
      });

    const seriesRound = await ensureSeriesLevel(root, STUDY, series, { jobs: jobManager });
    const studyRound = await study;
    const countsOf = list =>
      Object.fromEntries(
        list.map(entry => [
          entry[SERIES_INSTANCE_UID].Value[0],
          entry[NUMBER_OF_SERIES_RELATED_INSTANCES].Value[0],
        ])
      );
    const expected = { [series]: INSTANCES_PER_SERIES + 1, [SERIES[1]]: INSTANCES_PER_SERIES };

    expect(seriesRound.committed).toBe(false);
    expect(studyRound.committed).toBe(true);
    expect(countsOf(studyRound.payload.seriesQueryArray)).toEqual(expected);
    await jobManager.whenIdle();
    expect(countsOf(readGzJson(seriesIndexPath()))).toEqual(expected);
  });

  // Test 22. User experience (SQR-U4, SQR-D17): a study whose round does not commit during a build of
  // the studies list is in the list after a later round
  it('lists a study whose round does not commit during a build of the studies list', async () => {
    const jobManager = createJobManager({ roundDelayMs: 10 });
    jobs = jobManager;
    const studiesIndexPath = path.join(root, 'studies', 'index.json.gz');
    fs.rmSync(studiesIndexPath);
    fs.rmSync(seriesIndexPath());
    fs.rmSync(path.join(studyDir(), 'index.json.gz'));
    let uploaded = false;
    let releaseNextRound;
    const listWritten = new Promise(resolve => {
      releaseNextRound = resolve;
    });
    const readJsonFile = FileDicomWebReader.prototype.readJsonFile;
    jest
      .spyOn(FileDicomWebReader.prototype, 'readJsonFile')
      .mockImplementation(async function readJsonFileSpy(relativePath, filename, options) {
        if (filename === 'series-singleton.json' && !uploaded) {
          uploaded = true;
          storeInstance('1.2.3.9', 1);
          deleteStaleSummaries(root, new Map([[`${STUDY}&1.2.3.9`, {}]]));
        } else if (
          uploaded &&
          relativePath === `studies/${STUDY}/series` &&
          filename === 'index.json'
        ) {
          // The next round of the study waits until the first write of the list
          await listWritten;
        }
        return readJsonFile.call(this, relativePath, filename, options);
      });

    const studyUIDs = () => readGzJson(studiesIndexPath).map(entry => entry['0020000D'].Value[0]);

    await ensureStudiesLevel(root, { jobs: jobManager });
    expect(uploaded).toBe(true);
    expect(studyUIDs()).toEqual([]);

    releaseNextRound();
    await jobManager.whenIdle();
    expect(studyUIDs()).toEqual([STUDY]);
  });

  // Test 23. The API must do this (SQR-D3, SQR-D11): a series with no instances starts no
  // build, and a build stores no series metadata for it
  it('starts no build for a series with no instances, and stores no metadata', async () => {
    const jobManager = createJobManager();
    const runSpy = jest.spyOn(jobManager, 'run');
    const emptyDir = path.join(studyDir(), 'series', '1.2.3.7');
    fs.mkdirSync(path.join(emptyDir, 'instances'), { recursive: true });

    expect(await ensureSeriesLevel(root, STUDY, '1.2.3.7', { jobs: jobManager })).toBeUndefined();
    expect(runSpy).not.toHaveBeenCalled();

    await seriesSummary(root, STUDY, '1.2.3.7');
    expect(fs.existsSync(path.join(emptyDir, 'metadata.gz'))).toBe(false);
  });

  // Test 24. The API must do this (SQR-D4): a series build whose files are current reads no
  // instance metadata and writes nothing (the early return of seriesSummary, cause C2)
  it('reads no instance metadata and writes nothing when the series files are current', async () => {
    const reads = spyOnReads();
    const openSpy = jest.spyOn(FileDicomWebWriter.prototype, '_openStream');

    const result = await seriesSummary(root, STUDY, SERIES[0]);

    expect(result.committed).toBe(true);
    expect(reads.filter(read => read.includes('/instances/'))).toEqual([]);
    expect(openSpy).not.toHaveBeenCalled();
  });

  // Test 26. User experience (SQR-U1): an upload during a study metadata request does not
  // remove a stored series from the response
  it('keeps each stored series in the study metadata when an upload changes one during the request', async () => {
    await startServer(createJobManager());
    const [first, second] = SERIES;
    let uploaded = false;
    spyOnReads(relativePath => {
      if (relativePath.endsWith(`/${first}`) && !uploaded) {
        uploaded = true;
        storeInstance(second, INSTANCES_PER_SERIES + 1);
        deleteStaleSummaries(root, new Map([[`${STUDY}&${second}`, {}]]));
      }
    });

    const response = await fetch(`${baseUrl}/studies/${STUDY}/metadata`);

    expect(uploaded).toBe(true);
    expect(response.status).toBe(200);
    const seriesOf = instance => instance[SERIES_INSTANCE_UID].Value[0];
    const instances = await response.json();
    expect(instances.filter(instance => seriesOf(instance) === first)).toHaveLength(
      INSTANCES_PER_SERIES
    );
    expect(
      instances.filter(instance => seriesOf(instance) === second).length
    ).toBeGreaterThanOrEqual(INSTANCES_PER_SERIES);
  });

  // Test 27. The API must do this (SQR-U1, SQR-D3): a corrupt series-singleton.json does not
  // leave a valid series out of the stored series index
  it('builds a series again when its series-singleton.json is corrupt, and stores it in the index', async () => {
    await startServer(createJobManager());
    fs.rmSync(seriesIndexPath());
    fs.writeFileSync(
      path.join(studyDir(), 'series', SERIES[1], 'series-singleton.json.gz'),
      'not gzip'
    );
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await fetch(`${baseUrl}/studies/${STUDY}/series`);

    expect(response.status).toBe(200);
    expect(seriesUIDsOf(await response.json())).toEqual(SERIES);
    expect(seriesUIDsOf(readGzJson(seriesIndexPath()))).toEqual(SERIES);
  });

  // Test 20. User experience (SQR-U1): a series with corrupt data does not hide the other series of
  // the study metadata
  it('serves the study metadata of the other series when one series has corrupt data', async () => {
    await startServer(createJobManager());
    const instanceDir = path.join(studyDir(), 'series', '1.2.3.8', 'instances', '1.2.3.8.1');
    fs.mkdirSync(instanceDir, { recursive: true });
    fs.writeFileSync(path.join(instanceDir, 'metadata.gz'), 'not gzip');
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await fetch(`${baseUrl}/studies/${STUDY}/metadata`);

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(SERIES.length * INSTANCES_PER_SERIES);
  });

  // Test 30. User experience (SQR-U4): a study that the server cannot read does not break the
  // studies list. After an I/O error, the list is not stored, and the next request builds it
  // with that study. After another error, the list is stored without that study
  it.each([
    ['an I/O error', 'ESTALE', false],
    ['a permanent error', 'ELOOP', true],
  ])('answers the studies list without a study that has %s', async (_, code, stored) => {
    const otherStudy = '1.2.4';
    const otherSeries = '1.2.4.1';
    storeInstance(otherSeries, 1, otherStudy);
    await seriesSummary(root, otherStudy, otherSeries);
    fs.rmSync(path.join(root, 'studies', 'index.json.gz'));
    await startServer(createJobManager());
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const recover = failReadsWithEstale(`${otherSeries}/series-singleton.json`, code);
    const studiesList = async () => {
      const response = await fetch(`${baseUrl}/studies`);
      expect(response.status).toBe(200);
      return (await response.json()).map(study => study['0020000D'].Value[0]).sort();
    };

    expect(await studiesList()).toEqual([STUDY]);
    expect(fs.existsSync(path.join(root, 'studies', 'index.json.gz'))).toBe(stored);

    recover();
    expect(await studiesList()).toEqual(stored ? [STUDY] : [STUDY, otherStudy]);
  });

  // Test 31. User experience (SQR-U1, SQR-D5): an upload that deletes the series index after
  // the check of a request, and before the file is sent, does not give 404
  it('builds the series index when an upload deletes it after the check of the request', async () => {
    await startServer(createJobManager());
    const stat = fs.stat;
    let deleted = false;
    jest.spyOn(fs, 'stat').mockImplementation((target, ...rest) => {
      if (!deleted && path.resolve(String(target)) === path.resolve(seriesIndexPath())) {
        deleted = true;
        fs.rmSync(seriesIndexPath());
      }
      return stat(target, ...rest);
    });

    const response = await fetch(`${baseUrl}/studies/${STUDY}/series`);

    expect(deleted).toBe(true);
    expect(response.status).toBe(200);
    expect(seriesUIDsOf(await response.json())).toEqual(SERIES);
  });

  // Test 32. The API must do this (SQR-U1, SQR-D3 rule 5): an upload that deletes the files of
  // a series during a study round does not leave that series out of the result of the round
  it('keeps a series in a study round when an upload deletes its files during the round', async () => {
    const [series] = SERIES;
    fs.rmSync(seriesIndexPath());
    const readJsonFile = FileDicomWebReader.prototype.readJsonFile;
    let uploaded = false;
    jest
      .spyOn(FileDicomWebReader.prototype, 'readJsonFile')
      .mockImplementation(async function readJsonFileSpy(relativePath, filename, options) {
        // studyMain checked the series files; the study round now reads the series index
        if (!uploaded && filename === 'index.json' && relativePath.endsWith('/series')) {
          uploaded = true;
          storeInstance(series, INSTANCES_PER_SERIES + 1);
          deleteStaleSummaries(root, new Map([[`${STUDY}&${series}`, {}]]));
        }
        return readJsonFile.call(this, relativePath, filename, options);
      });

    const result = await studyMain(STUDY, { dicomdir: root });

    expect(uploaded).toBe(true);
    expect(result.committed).toBe(false);
    const counts = Object.fromEntries(
      result.payload.seriesQueryArray.map(entry => [
        entry[SERIES_INSTANCE_UID].Value[0],
        entry[NUMBER_OF_SERIES_RELATED_INSTANCES].Value[0],
      ])
    );
    expect(counts).toEqual({
      [series]: INSTANCES_PER_SERIES + 1,
      [SERIES[1]]: INSTANCES_PER_SERIES,
    });
  });

  // Test 9. User experience (SQR-U3, SQR-D11, SQR-D14): a full queue rejects only
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

  // Test 7. The API must do this (SQR-D10): `createdicomweb study --force` writes the study files
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

  // Test 10. User experience (SQR-U4, SQR-D17): the studies list lists each stored study, and an update of a
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
