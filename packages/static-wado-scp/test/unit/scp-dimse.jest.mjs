// C-STORE, C-FIND, C-GET and C-MOVE against an in-process DcmjsDimseScp
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import dcmjsDimse from 'dcmjs-dimse';
import { aeConfig, createVerboseLog } from '@radicalimaging/static-wado-util';
import StaticWado from '@radicalimaging/static-wado-creator';
import { dicomWebScpConfig, DcmjsDimseScp } from '../../lib/index.mjs';
import loadPlugins from '../../lib/loadPlugins.mjs';

const { Client, Dataset, Server, Transcoding } = dcmjsDimse;
const { CStoreRequest, CFindRequest, CGetRequest, CMoveRequest } = dcmjsDimse.requests;
const { CStoreResponse } = dcmjsDimse.responses;
const { Status } = dcmjsDimse.constants;

const FIXTURE = path.join(__dirname, '../../../static-wado-creator/dicom/jpeg8bit.dcm');
const fixture = Dataset.fromFile(FIXTURE);
const STUDY = fixture.getElement('StudyInstanceUID');
const SOP = fixture.getElement('SOPInstanceUID');

const freePort = () =>
  new Promise(resolve => {
    const probe = net.createServer().listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/** Sends the requests on one association; resolves when it closes. */
const send = (port, requests, client = new Client(), calledAe = 'DICOMWEB') =>
  new Promise((resolve, reject) => {
    requests.forEach(r => client.addRequest(r));
    client.on('networkError', reject);
    client.on('associationRejected', () => reject(new Error('association rejected')));
    client.on('closed', resolve);
    client.send('127.0.0.1', port, 'TESTSCU', calledAe);
  });

/** Records the last response status of a request. */
const lastStatus = request => {
  const result = {};
  request.on('response', response => {
    result.status = response.getStatus();
    result.response = response;
  });
  return result;
};

/** Waits until a file exists; the importer writes the indexes after the association closes. */
const waitFor = async file => {
  for (let i = 0; i < 100 && !fs.existsSync(file); i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  return fs.existsSync(file);
};

const retrieveDirs = () => fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('scp-retrieve-'));

let rootDir;
let destRoot;
let scpPort;
let server;
let destination;

beforeAll(async () => {
  // The importer logs through console.verbose and console.noQuiet
  createVerboseLog(false, { quiet: true });
  dcmjsDimse.log.setLevel('silent');
  await Transcoding.initializeAsync();
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-dimse-'));
  destRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-dimse-dest-'));
  const adapt = dir =>
    StaticWado.adaptProgramOpts(
      { ...dicomWebScpConfig, dir, verbose: false },
      { isInstance: false, isGroup: true, isDeduplicate: true, isStudyData: true }
    );
  const options = adapt(rootDir);
  await loadPlugins(options);
  DcmjsDimseScp.setParams(options);
  scpPort = await freePort();
  server = new Server(DcmjsDimseScp);
  server.listen(scpPort, options);

  // The C-MOVE destination is a second Static DICOMweb SCP that imports what it gets
  const destinationPort = await freePort();
  destination = new Server(DcmjsDimseScp);
  destination.listen(destinationPort, adapt(destRoot));
  aeConfig.TESTDEST = { host: '127.0.0.1', port: destinationPort };

  // Every later test needs the stored study
  const store = new CStoreRequest(FIXTURE);
  const stored = lastStatus(store);
  await send(scpPort, [store]);
  expect(stored.status).toBe(Status.Success);
  await waitFor(path.join(rootDir, 'studies', 'index.json.gz'));
}, 60000);

afterAll(() => {
  server.close();
  destination.close();
  fs.rmSync(rootDir, { recursive: true, force: true });
  fs.rmSync(destRoot, { recursive: true, force: true });
});

it('C-STORE writes the study into the Static DICOMweb layout', () => {
  const seriesIndex = path.join(rootDir, 'studies', STUDY, 'series', 'index.json.gz');
  expect(fs.existsSync(seriesIndex)).toBe(true);
});

it('C-FIND at the study level finds the stored study', async () => {
  const find = CFindRequest.createStudyFindRequest({ StudyInstanceUID: STUDY });
  const matches = [];
  find.on('response', response => {
    if (response.getStatus() === Status.Pending) matches.push(response.getDataset());
  });
  const result = lastStatus(find);
  await send(scpPort, [find]);
  expect(result.status).toBe(Status.Success);
  expect(matches.map(m => m.getElement('StudyInstanceUID'))).toEqual([STUDY]);
});

it('C-GET sends the stored instance back on the same association', async () => {
  const get = CGetRequest.createStudyGetRequest(STUDY);
  const result = lastStatus(get);
  const received = [];
  const client = new Client();
  client.on('cStoreRequest', (request, callback) => {
    received.push(request.getDataset());
    const response = CStoreResponse.fromRequest(request);
    response.setStatus(Status.Success);
    callback(response);
  });
  await send(scpPort, [get], client);
  expect(result.status).toBe(Status.Success);
  expect(result.response.getCompleted()).toBe(1);
  const [instance] = received;
  expect(instance.getElement('SOPInstanceUID')).toBe(SOP);
  // AT is a tag number: FrameIncrementPointer is (0018,1063) FrameTime
  expect([instance.getElement('FrameIncrementPointer')].flat()[0]).toBe(0x00181063);
  // The deduplication bookkeeping of the store is not instance data
  expect(JSON.stringify(instance.getElements())).not.toContain('dedupped');
}, 30000);

it('C-MOVE to another Static DICOMweb SCP imports the stored instance there', async () => {
  const move = CMoveRequest.createStudyMoveRequest('TESTDEST', STUDY);
  const result = lastStatus(move);
  await send(scpPort, [move]);
  expect(result.status).toBe(Status.Success);
  expect(result.response.getCompleted()).toBe(1);
  expect(await waitFor(path.join(destRoot, 'studies', STUDY, 'series', 'index.json.gz'))).toBe(
    true
  );
}, 30000);

it('C-GET with an invalid UID fails with 0xA900 and reads no files', async () => {
  const get = CGetRequest.createStudyGetRequest('../studies');
  const result = lastStatus(get);
  await send(scpPort, [get]);
  expect(result.status).toBe(0xa900);
});

it('an abort during C-GET removes the temporary files', async () => {
  const before = retrieveDirs();
  const get = CGetRequest.createStudyGetRequest(STUDY);
  const client = new Client();
  client.on('cStoreRequest', () => client.abort());
  await send(scpPort, [get], client).catch(() => {});
  for (let i = 0; i < 100 && retrieveDirs().length > before.length; i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  expect(retrieveDirs()).toEqual(before);
}, 30000);

it('C-MOVE to an unknown AE fails with 0xA801', async () => {
  const move = CMoveRequest.createStudyMoveRequest('NO_SUCH_AE', STUDY);
  const result = lastStatus(move);
  await send(scpPort, [move]);
  expect(result.status).toBe(0xa801);
});
