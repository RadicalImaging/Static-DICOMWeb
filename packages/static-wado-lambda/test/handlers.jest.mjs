import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createMain } from '@radicalimaging/create-dicomweb';
import { createVerboseLog } from '@radicalimaging/static-wado-util';
import { fileToKey } from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import { createContext } from '../lib/context.mjs';
import { directoryStore } from '../lib/stores/directory.mjs';
import { createLocalServer } from '../lib/localServer.mjs';

const studyUID = '1.2.3';
const seriesUID = '1.2.3.4';
const sops = ['1.2.3.4.1', '1.2.3.4.2'];
const seriesDir = `studies/${studyUID}/series/${seriesUID}`;
const idcBulk = 'https://upstream.example/bulk/current/root/dicomWeb';

/** An instance in the form of the IDC metadata: absolute BulkDataURI values on a `/bulk` path */
const upstreamInstance = sop => {
  const instanceUrl = `${idcBulk}/${seriesDir}/instances/${sop}/bulkdata`;
  return {
    '00020001': { vr: 'OB', BulkDataURI: `${instanceUrl}/00020001` },
    '00020010': { vr: 'UI', Value: ['1.2.840.10008.1.2.4.50'] },
    '0020000D': { vr: 'UI', Value: [studyUID] },
    '0020000E': { vr: 'UI', Value: [seriesUID] },
    '00080018': { vr: 'UI', Value: [sop] },
    '00131010': { vr: 'UN', BulkDataURI: `${instanceUrl}/00131010` },
    '7FE00010': { vr: 'OW', BulkDataURI: `${instanceUrl}/7FE00010` },
  };
};

const listen = server =>
  new Promise(resolve =>
    server.listen(0, () => resolve(`http://localhost:${server.address().port}`))
  );

const readStored = async (store, key) => {
  const stored = await store.get(key);
  return stored && JSON.parse(gunzipSync(stored.body).toString());
};

/** Each BulkDataURI of a metadata document, resolved against the URL of the document */
const resolvedBulkData = (metadata, documentKey) =>
  metadata.flatMap(instance =>
    Object.values(instance)
      .filter(value => value.BulkDataURI)
      .map(value => new URL(value.BulkDataURI, `http://host/${documentKey}`).pathname.slice(1))
  );

describe('metadata and query handlers', () => {
  let upstream;
  let upstreamUrl;
  let responses;
  let requests;
  let store;
  let dir;
  let server;
  let proxyUrl;

  beforeAll(async () => {
    responses = {
      [`/${seriesDir}/metadata`]: sops.map(upstreamInstance),
    };
    requests = [];
    upstream = http.createServer((req, res) => {
      requests.push(req.url);
      const body = responses[req.url];
      if (!body) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/dicom+json' }).end(JSON.stringify(body));
    });
    upstreamUrl = await listen(upstream);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-handlers-'));
    store = directoryStore(path.join(dir, 'store'));
    server = createLocalServer(
      createContext({ config: { root: '/dicomweb', upstream: upstreamUrl }, store })
    );
    proxyUrl = `${await listen(server)}/dicomweb`;
  });

  afterAll(() => {
    server.close();
    upstream.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // User behaviour: PRX-IMP-6, PRX-IMP-27, PRX-USR-1
  it('stores the series and instance metadata on a miss, and serves the next request from the store', async () => {
    const first = await fetch(`${proxyUrl}/${seriesDir}/metadata`);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(await readStored(store, `${seriesDir}/metadata`)).toEqual(firstBody);
    // PRX-IMP-16: no group 0002; the stored transfer syntax becomes (0008,3002)
    expect(Object.keys(firstBody[0]).filter(tag => tag.startsWith('0002'))).toEqual([]);
    expect(firstBody[0]['00083002'].Value).toEqual(['1.2.840.10008.1.2.4.50']);
    for (const sop of sops) {
      expect(await store.exists(`${seriesDir}/instances/${sop}/metadata`)).toBe(true);
    }

    const upstreamCalls = requests.length;
    const second = await fetch(`${proxyUrl}/${seriesDir}/metadata`);
    expect(await second.json()).toEqual(firstBody);
    expect(requests.length).toBe(upstreamCalls);
  });

  // User behaviour: PRX-USR-3, the stored BulkDataURI values resolve through the proxy URL
  it('stores BulkDataURI values that resolve to the keys of the instance', async () => {
    const expected = sop => [
      `${seriesDir}/instances/${sop}/bulkdata/00131010`,
      `${seriesDir}/instances/${sop}/frames`,
    ];
    const seriesKey = `${seriesDir}/metadata`;
    expect(resolvedBulkData(await readStored(store, seriesKey), seriesKey)).toEqual(
      sops.flatMap(expected)
    );
    const instanceKey = `${seriesDir}/instances/${sops[0]}/metadata`;
    expect(resolvedBulkData(await readStored(store, instanceKey), instanceKey)).toEqual(
      expected(sops[0])
    );
  });

  // User behaviour: PRX-USR-6, the exact-UID study query stores the file that create-dicomweb writes
  it('stores an exact-UID study query in the create-dicomweb form', async () => {
    createVerboseLog(false, { quiet: true });
    const dicomdir = path.join(dir, 'create-dicomweb');
    const testFile = path.resolve(__dirname, '../../../testdata/dcm/Dummy/D3A3B6E7.dcm');
    await createMain([testFile], { dicomdir, studyIndex: false });
    const [study] = fs.readdirSync(path.join(dicomdir, 'studies'));
    const file = `studies/${study}/index.json.gz`;
    const written = JSON.parse(gunzipSync(fs.readFileSync(path.join(dicomdir, file))).toString());
    responses[`/studies?StudyInstanceUID=${study}`] = written;

    const response = await fetch(`${proxyUrl}/studies?StudyInstanceUID=${study}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(written);
    expect(await readStored(store, fileToKey(file))).toEqual(written);
  }, 60_000);
});
