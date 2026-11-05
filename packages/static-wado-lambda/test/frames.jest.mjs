import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { decodeFrame, imageInfoFromDict, JPEG_BASELINE } from '@dcmjs/commands/pixel';
import {
  unwrapMultipart,
  wrapMultipart,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import { createContext } from '../lib/context.mjs';
import { inProcessCompute } from '../lib/compute/inProcess.mjs';
import { frameAccept } from '../lib/handlers/frames.mjs';
import { directoryStore } from '../lib/stores/directory.mjs';
import { createLocalServer } from '../lib/localServer.mjs';

const EXPLICIT_LE = '1.2.840.10008.1.2.1';
const JLS = '1.2.840.10008.1.2.4.80';
const JXL_JPEG = '1.2.840.10008.1.2.4.111';
const MPEG4 = '1.2.840.10008.1.2.4.102';
const seriesDir = 'studies/1.2.3/series/1.2.3.4';
const instanceDir = sop => `${seriesDir}/instances/${sop}`;

const value = (vr, v) => ({ vr, Value: [v] });
const instance = (sop, sopClass, transferSyntax, image) => ({
  '00020010': value('UI', transferSyntax),
  '00080016': value('UI', sopClass),
  '00080018': value('UI', sop),
  '0020000D': value('UI', '1.2.3'),
  '0020000E': value('UI', '1.2.3.4'),
  '00280010': value('US', image.rows),
  '00280011': value('US', image.columns),
  '00280002': value('US', image.samples),
  '00280004': value('CS', image.photometric),
  '00280100': value('US', image.bits),
  '00280101': value('US', image.bits),
  '00280103': value('US', 0),
});

const listen = server =>
  new Promise(resolve =>
    server.listen(0, () => resolve(`http://localhost:${server.address().port}`))
  );

const bytes = async response => Buffer.from(await response.arrayBuffer());

describe('frame and bulkdata handlers', () => {
  const ct = instance('1.2.3.4.1', '1.2.840.10008.5.1.4.1.1.2', EXPLICIT_LE, {
    rows: 4,
    columns: 4,
    samples: 1,
    photometric: 'MONOCHROME2',
    bits: 16,
  });
  const wsi = instance('1.2.3.4.2', '1.2.840.10008.5.1.4.1.1.77.1.6', JPEG_BASELINE, {
    rows: 16,
    columns: 16,
    samples: 3,
    photometric: 'YBR_FULL_422',
    bits: 8,
  });
  const video = instance('1.2.3.4.3', '1.2.840.10008.5.1.4.1.1.77.1.1.1', MPEG4, {
    rows: 16,
    columns: 16,
    samples: 3,
    photometric: 'YBR_PARTIAL_420',
    bits: 8,
  });
  const ctPixels = Buffer.from(Uint16Array.from({ length: 16 }, (_, i) => i * 300).buffer);
  const videoBytes = Buffer.from('not really an mpeg-4 stream');
  /** Path to the stored frame of the fake upstream: `{transferSyntaxUid, contentType, body}` */
  const frames = {};
  const responses = {};
  const encodes = [];
  let accepts;
  let requests;
  let upstream;
  let server;
  let store;
  let dir;
  let proxyUrl;

  beforeAll(async () => {
    // shortcut: a stand-in JPEG; the JPEG encoder of the codec package fails in node.
    const jpeg = Buffer.from('a JPEG baseline codestream');
    upstream = http.createServer((req, res) => {
      requests.push(req.url);
      accepts.push(req.headers.accept);
      const frame = frames[req.url];
      if (frame) {
        // Like IDC: the stored form only; a different requested syntax is not served.
        const requested = /transfer-syntax=([\d.]+)/.exec(req.headers.accept)?.[1];
        if (requested && requested !== frame.transferSyntaxUid) {
          res.writeHead(406).end();
          return;
        }
        const { body, contentType } = wrapMultipart([frame]);
        res.writeHead(200, { 'Content-Type': contentType }).end(body);
        return;
      }
      const json = responses[req.url];
      if (json) {
        res.writeHead(200, { 'Content-Type': 'application/dicom+json' }).end(JSON.stringify(json));
        return;
      }
      res.writeHead(404).end();
    });
    const upstreamUrl = await listen(upstream);
    ct['00131010'] = {
      vr: 'UN',
      BulkDataURI: `${upstreamUrl}/bulk/${instanceDir('1.2.3.4.1')}/bulkdata/00131010`,
    };
    const noSyntax = { ...ct, '00080018': value('UI', '1.2.3.4.4') };
    delete noSyntax['00020010'];
    frames[`/bulk/${instanceDir('1.2.3.4.1')}/bulkdata/00131010`] = {
      contentType: 'application/octet-stream',
      body: Buffer.from('ABCD'),
    };
    for (const [dict, frame] of [
      [
        ct,
        { transferSyntaxUid: EXPLICIT_LE, contentType: 'application/octet-stream', body: ctPixels },
      ],
      [
        wsi,
        { transferSyntaxUid: JPEG_BASELINE, contentType: 'image/jpeg', body: Buffer.from(jpeg) },
      ],
      [video, { transferSyntaxUid: MPEG4, contentType: 'video/mp4', body: videoBytes }],
      [
        noSyntax,
        { transferSyntaxUid: EXPLICIT_LE, contentType: 'application/octet-stream', body: ctPixels },
      ],
    ]) {
      const dirOf = instanceDir(dict['00080018'].Value[0]);
      responses[`/${dirOf}/metadata`] = [dict];
      frames[`/${dirOf}/frames/1`] = frame;
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-frames-'));
    store = directoryStore(dir);
    server = createLocalServer(
      createContext({
        config: { root: '/dicomweb', upstream: upstreamUrl, variants: ['jls'] },
        store,
        // The codec tests of dcmjs-commands cover the transcode; this records the request.
        compute: {
          encode: options => {
            encodes.push(options);
            return options.targetUid === JXL_JPEG
              ? Buffer.from('a JPEG XL codestream')
              : inProcessCompute.encode(options);
          },
        },
      })
    );
    proxyUrl = `${await listen(server)}/dicomweb`;
  });

  beforeEach(() => {
    accepts = [];
    requests = [];
  });

  afterAll(() => {
    server.close();
    upstream.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const storedPart = async key => unwrapMultipart((await store.get(key)).body)[0];

  // User behaviour: PRX-USR-14, PRX-USR-2, PRX-IMP-15, D5
  it('stores an uncompressed grayscale frame as JPEG-LS, pixel-exact, and gives the same bytes twice', async () => {
    const url = `${proxyUrl}/${instanceDir('1.2.3.4.1')}/frames/1`;
    const first = await fetch(url);
    expect(first.status).toBe(200);
    const firstBytes = await bytes(first);
    // The metadata holds the destination (D6), the upstream refuses it, and the default follows.
    expect(accepts.find(a => a.includes('transfer-syntax'))).toContain(`transfer-syntax=${JLS}`);
    const part = await storedPart(`${instanceDir('1.2.3.4.1')}/frames/1`);
    expect(part.transferSyntaxUid).toBe(JLS);
    const decoded = await decodeFrame(part.body, imageInfoFromDict(ct), JLS);
    expect(Buffer.from(decoded)).toEqual(ctPixels);

    const upstreamCalls = requests.length;
    const second = await fetch(url);
    expect(await bytes(second)).toEqual(firstBytes);
    expect(requests.length).toBe(upstreamCalls);
  });

  // User behaviour: PRX-USR-5, Q20
  it('gives a permitted single-part variant with no multipart wrapper', async () => {
    const response = await fetch(`${proxyUrl}/${instanceDir('1.2.3.4.1')}/frames/1.jls`);
    expect(response.headers.get('content-type')).toBe('image/jls');
    const body = await bytes(response);
    expect(body.subarray(0, 2).toString()).not.toBe('--');
    expect(body).toEqual((await storedPart(`${instanceDir('1.2.3.4.1')}/frames/1`)).body);
    expect((await fetch(`${proxyUrl}/${instanceDir('1.2.3.4.1')}/frames/1.jp2`)).status).toBe(406);
  });

  // User behaviour: Q17, D5 (the stored form is requested)
  it('stores a JPEG WSI frame as JPEG XL JPEG recompression', async () => {
    const response = await fetch(`${proxyUrl}/${instanceDir('1.2.3.4.2')}/frames/1`);
    expect(response.status).toBe(200);
    expect(accepts.find(a => a.includes('transfer-syntax'))).toContain(
      `transfer-syntax=${JPEG_BASELINE}`
    );
    expect(encodes.at(-1)).toMatchObject({ sourceUid: JPEG_BASELINE, targetUid: JXL_JPEG });
    expect((await storedPart(`${instanceDir('1.2.3.4.2')}/frames/1`)).transferSyntaxUid).toBe(
      JXL_JPEG
    );
  });

  // User behaviour: PRX-USR-16
  it('stores a video instance unchanged', async () => {
    const response = await fetch(`${proxyUrl}/${instanceDir('1.2.3.4.3')}/frames/1`);
    expect(response.status).toBe(200);
    // The upstream does not list MPEG-4 frames, so the first request asks for Explicit VR LE.
    expect(accepts.find(a => a.includes('transfer-syntax'))).toContain(
      `transfer-syntax=${EXPLICIT_LE}`
    );
    const part = await storedPart(`${instanceDir('1.2.3.4.3')}/frames/1`);
    expect(part.transferSyntaxUid).toBe(MPEG4);
    expect(part.body).toEqual(videoBytes);
  });

  // User behaviour: D5, metadata with no transfer syntax gives the Q30 request form
  it('requests Explicit VR Little Endian when the metadata has no transfer syntax', async () => {
    const response = await fetch(`${proxyUrl}/${instanceDir('1.2.3.4.4')}/frames/1`);
    expect(response.status).toBe(200);
    expect(accepts.filter(a => a.includes('transfer-syntax'))).toEqual([
      `multipart/related; type="application/octet-stream"; transfer-syntax=${EXPLICIT_LE}`,
    ]);
    expect((await storedPart(`${instanceDir('1.2.3.4.4')}/frames/1`)).transferSyntaxUid).toBe(JLS);
  });

  // User behaviour: D7, the bulkdata key of the stored metadata gives the upstream bulkdata
  it('stores bulkdata at the key of the stored BulkDataURI', async () => {
    const key = `${instanceDir('1.2.3.4.1')}/bulkdata/00131010`;
    const response = await fetch(`${proxyUrl}/${key}`);
    expect(response.status).toBe(200);
    expect((await storedPart(key)).body.toString()).toBe('ABCD');
  });
});

// API contract: D5, the request form of a final form
describe('frameAccept', () => {
  const syntaxOf = uid => /transfer-syntax=([\d.]+)/.exec(frameAccept(uid))[1];
  it('asks for JPEG baseline for .111, the syntax itself when the upstream sends it, else Explicit VR LE', () => {
    expect(syntaxOf(JXL_JPEG)).toBe(JPEG_BASELINE);
    expect(syntaxOf(JLS)).toBe(JLS);
    expect(syntaxOf(MPEG4)).toBe(EXPLICIT_LE);
    expect(syntaxOf('1.2.840.10008.1.2')).toBe(EXPLICIT_LE);
  });
});
