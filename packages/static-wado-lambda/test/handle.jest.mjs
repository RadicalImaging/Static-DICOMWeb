import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { handle, errorResponse } from '../lib/handle.mjs';
import { createContext } from '../lib/context.mjs';
import { Upstream } from '../lib/upstream.mjs';
import { directoryStore } from '../lib/stores/directory.mjs';
import { createLocalServer } from '../lib/localServer.mjs';
import { listen } from './listen.mjs';

const series = 'studies/1.2.3/series/4.5';

// API contract: PRX-IMP-25
describe('errorResponse', () => {
  it.each([
    [404, undefined, 'max-age=300'],
    [429, '30', 'max-age=10'],
    [502, undefined, 'max-age=10'],
    [401, undefined, 'max-age=10'],
  ])('maps %s', (status, retryAfter, cacheControl) => {
    const response = errorResponse({ status, retryAfter });
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe(cacheControl);
    expect(response.headers.get('Retry-After')).toBe(retryAfter ?? null);
  });
});

describe('local server', () => {
  let upstream;
  let upstreamUrl;
  let requests;
  let store;
  let dir;

  beforeAll(async () => {
    requests = [];
    upstream = http.createServer((req, res) => {
      requests.push(req.url);
      res.writeHead(404, { 'Retry-After': '5' }).end();
    });
    upstreamUrl = await listen(upstream);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-store-'));
    store = directoryStore(dir);
  });

  afterAll(() => {
    upstream.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const fetchProxy = async (config, file) => {
    const context = createContext({
      config: { root: '/dicomweb', upstream: upstreamUrl, ...config },
      store,
    });
    const server = createLocalServer(context);
    const url = await listen(server);
    try {
      return await fetch(`${url}/dicomweb/${file}`);
    } finally {
      server.close();
    }
  };

  // User behaviour: an upstream 404 reaches the client with the error cache time
  it('returns 404 with the error cache header for an upstream 404', async () => {
    const response = await fetchProxy({}, `${series}/metadata`);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('max-age=300');
    expect(requests).toContain(`/${series}/metadata`);
  });

  // API contract: the allowlist permits a study of a stored collection page only
  it('applies the allowlist from the stored collection pages', async () => {
    const page = [{ '0020000D': { vr: 'UI', Value: ['1.2.3'] } }];
    await store.put('collections/c1/studies', gzipSync(JSON.stringify(page)), {
      contentType: 'application/json',
      contentEncoding: 'gzip',
    });
    const config = { allow: { collections: ['c1'] } };
    const context = createContext({
      config: { root: '/dicomweb', upstream: upstreamUrl, ...config },
      store,
    });
    expect(await context.upstream.isAllowed('1.2.3')).toBe(true);
    expect(await context.upstream.isAllowed('9.9')).toBe(false);

    const denied = await fetchProxy(config, 'studies/9.9/series/1/metadata');
    expect(denied.status).toBe(403);
    // D10: a query that can name other studies is refused, with no upstream request
    const calls = requests.length;
    expect((await fetchProxy(config, 'studies?PatientName=A*')).status).toBe(403);
    expect(requests.length).toBe(calls);
  });

  // API contract: D10, a refused series query sends no upstream search
  it('refuses a series query by UID before the upstream search', async () => {
    const config = { allow: { studies: ['1.2.3'] } };
    const calls = requests.length;
    expect((await fetchProxy(config, 'series?SeriesInstanceUID=4.5')).status).toBe(403);
    expect(
      (await fetchProxy(config, 'series?SeriesInstanceUID=4.5&StudyInstanceUID=9.9')).status
    ).toBe(403);
    expect(requests.length).toBe(calls);
  });

  // API contract: PRX-USR-18, PRX-IMP-3, a 401 reads the token again and repeats one time
  it('repeats an upstream request one time with a fresh token after a 401', async () => {
    const seen = [];
    const tokenServer = http.createServer((req, res) => {
      seen.push(req.headers.authorization);
      if (req.headers.authorization !== 'Bearer new') {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/dicom+json' }).end('[]');
    });
    let token = 'old';
    const secrets = {
      getToken: async ({ refresh } = {}) => {
        if (refresh) {
          token = 'new';
        }
        return token;
      },
    };
    const client = new Upstream({ url: await listen(tokenServer), secrets });
    try {
      expect(await client.search('studies')).toEqual([]);
      expect(seen).toEqual(['Bearer old', 'Bearer new']);
    } finally {
      tokenServer.close();
    }
  });

  // User behaviour: PRX-USR-9, no client can store data
  it('rejects a write (no STOW-RS)', async () => {
    const context = { config: { root: '/dicomweb' } };
    const response = await handle(
      new Request('http://host/dicomweb/studies', { method: 'POST' }),
      context
    );
    expect(response.status).toBe(405);
  });
});
