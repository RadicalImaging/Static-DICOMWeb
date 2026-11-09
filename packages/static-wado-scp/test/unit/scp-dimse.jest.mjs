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

const { Client, Dataset, Server, Scp, Transcoding } = dcmjsDimse;
const { CStoreRequest, CFindRequest, CGetRequest, CMoveRequest } = dcmjsDimse.requests;
const { CStoreResponse } = dcmjsDimse.responses;
const { Status, PresentationContextResult } = dcmjsDimse.constants;

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

// The C-MOVE destination: an SCP that keeps each received dataset
const moved = [];
class DestinationScp extends Scp {
  associationRequested(association) {
    for (const { id } of association.getPresentationContexts()) {
      const context = association.getPresentationContext(id);
      context.setResult(PresentationContextResult.Accept, context.getTransferSyntaxUids()[0]);
    }
    this.sendAssociationAccept();
  }
  associationReleaseRequested() {
    this.sendAssociationReleaseResponse();
  }
  cStoreRequest(request, callback) {
    moved.push(request.getDataset());
    const response = CStoreResponse.fromRequest(request);
    response.setStatus(Status.Success);
    callback(response);
  }
}

let rootDir;
let scpPort;
let server;
let destination;

beforeAll(async () => {
  // The importer logs through console.verbose and console.noQuiet
  createVerboseLog(false, { quiet: true });
  dcmjsDimse.log.setLevel('silent');
  await Transcoding.initializeAsync();
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-dimse-'));
  const options = StaticWado.adaptProgramOpts(
    { ...dicomWebScpConfig, dir: rootDir, verbose: false },
    { isInstance: false, isGroup: true, isDeduplicate: true, isStudyData: true }
  );
  await loadPlugins(options);
  DcmjsDimseScp.setParams(options);
  scpPort = await freePort();
  server = new Server(DcmjsDimseScp);
  server.listen(scpPort, options);

  const destinationPort = await freePort();
  destination = new Server(DestinationScp);
  destination.listen(destinationPort);
  aeConfig.TESTDEST = { host: '127.0.0.1', port: destinationPort };

  // Every later test needs the stored study
  const store = new CStoreRequest(FIXTURE);
  const stored = lastStatus(store);
  await send(scpPort, [store]);
  expect(stored.status).toBe(Status.Success);
  // The importer writes the studies index after the association closes
  const index = path.join(rootDir, 'studies', 'index.json.gz');
  for (let i = 0; i < 100 && !fs.existsSync(index); i++) {
    await new Promise(r => setTimeout(r, 50));
  }
}, 60000);

afterAll(() => {
  server.close();
  destination.close();
  fs.rmSync(rootDir, { recursive: true, force: true });
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
  expect(received.map(d => d.getElement('SOPInstanceUID'))).toEqual([SOP]);
}, 30000);

it('C-MOVE sends the stored instance to the destination AE', async () => {
  moved.length = 0;
  const move = CMoveRequest.createStudyMoveRequest('TESTDEST', STUDY);
  const result = lastStatus(move);
  await send(scpPort, [move]);
  expect(result.status).toBe(Status.Success);
  expect(moved.map(d => d.getElement('SOPInstanceUID'))).toEqual([SOP]);
}, 30000);

it('C-MOVE to an unknown AE fails with 0xA801', async () => {
  const move = CMoveRequest.createStudyMoveRequest('NO_SUCH_AE', STUDY);
  const result = lastStatus(move);
  await send(scpPort, [move]);
  expect(result.status).toBe(0xa801);
});
