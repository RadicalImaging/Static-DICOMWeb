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
  let waits;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stow-main-'));
    fs.writeFileSync(path.join(dir, 'a.dcm'), 'data');
    requests = 0;
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const status = statuses[Math.min(requests, statuses.length - 1)];
        requests += 1;
        // A server or a proxy that closes the connection with no response
        if (status === 'reset') return req.socket.destroy();
        if (status === 503) res.setHeader('Retry-After', '0');
        if (status === 202) {
          // One failed item, matched to its file by the Content-Location tag of the server
          const failed = {
            '00091001': { vr: 'LO', Value: ['b.dcm'] },
            '00081197': { vr: 'US', Value: [0xc000] },
          };
          res
            .writeHead(202, { 'content-type': 'application/dicom+json' })
            .end(JSON.stringify({ '00081198': { vr: 'SQ', Value: [failed] } }));
          return;
        }
        res.writeHead(status, { 'content-type': 'text/plain' }).end('body');
      });
    });
    server.listen(0);
    await once(server, 'listening');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {});
    // The retry after a reset waits DEFAULT_RETRY_AFTER_SECONDS (10 s); the test does not wait
    waits = [];
    const realSetTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms, ...args) => {
      if (ms === 10000) waits.push(ms);
      return realSetTimeout(fn, ms === 10000 ? 0 : ms, ...args);
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const stow = () =>
    stowMain([dir], { url: `http://127.0.0.1:${server.address().port}/studies`, quiet: true });

  // Test 55. The user experience must have this (SQR-U5): the stow command sends a group again
  // after a 503 or a connection reset, and gives a failed group to its exit code (the failed
  // count). A reset does not stop the command.
  it.each([
    ['stores the group after two 503 responses', [503, 503, 200], 3, 0],
    ['fails the group after the last 503 retry', [503], 4, 1],
    ['fails the group on 409 with no retry', [409], 1, 1],
    ['stores the group after a connection reset', ['reset', 200], 2, 0],
    ['fails the group after the last connection reset retry', ['reset'], 4, 1],
  ])('%s', async (_, codes, requestCount, failed) => {
    statuses = codes;
    const results = await stow();
    expect(requests).toBe(requestCount);
    expect(results.failed).toBe(failed);
    expect(process.exit).not.toHaveBeenCalled();
    expect(waits).toHaveLength(codes[0] === 'reset' ? requestCount - 1 : 0);
  });

  // Test 55, 202 case: the failed instances of a 202 count as failed, so the command exits
  // with 1, and the stored instances count as stored
  it('counts the failed instances of a 202 as failed', async () => {
    fs.writeFileSync(path.join(dir, 'b.dcm'), 'data');
    statuses = [202];
    const results = await stow();
    expect(requests).toBe(1);
    expect(results).toMatchObject({ success: 1, failed: 1 });
    expect(results.errors.map(({ file }) => path.basename(file))).toEqual(['b.dcm']);
  });
});
