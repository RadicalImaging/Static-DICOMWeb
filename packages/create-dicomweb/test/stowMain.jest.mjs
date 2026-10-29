import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'node:http';
import { once } from 'events';
import { stowMain } from '../lib/commands/stowMain.mjs';

/** The stow command and the status codes of SQR-U5 */
describe('stowMain', () => {
  let dir;
  let server;
  let statuses;
  let requests;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stow-main-'));
    fs.writeFileSync(path.join(dir, 'a.dcm'), 'data');
    requests = 0;
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const status = statuses[Math.min(requests, statuses.length - 1)];
        requests += 1;
        if (status === 503) res.setHeader('Retry-After', '0');
        res.writeHead(status, { 'content-type': 'text/plain' }).end('body');
      });
    });
    server.listen(0);
    await once(server, 'listening');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const stow = () =>
    stowMain([dir], { url: `http://127.0.0.1:${server.address().port}/studies`, quiet: true });

  // Test 55. The user experience must have this (SQR-U5): the stow command sends a group again
  // after a 503, and gives a failed group to its exit code (the failed count)
  it.each([
    ['stores the group after two 503 responses', [503, 503, 200], 3, 0],
    ['fails the group after the last 503 retry', [503], 4, 1],
    ['fails the group on 409 with no retry', [409], 1, 1],
  ])('%s', async (_, codes, requestCount, failed) => {
    statuses = codes;
    const results = await stow();
    expect(requests).toBe(requestCount);
    expect(results.failed).toBe(failed);
  });
});
