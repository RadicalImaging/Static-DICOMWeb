import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'node:http';
import { once } from 'events';
import { Readable } from 'stream';
import { stowMain, stowFiles } from '../lib/commands/stowMain.mjs';

/** The stow command and the status codes of SQR-U5 */
describe('stowMain', () => {
  let dir;
  let server;
  let statuses;
  let requests;
  let waits;
  let echoLocation;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stow-main-'));
    fs.writeFileSync(path.join(dir, 'a.dcm'), 'data');
    requests = 0;
    echoLocation = true;
    server = http.createServer((req, res) => {
      // The 503 of a full stalled count (SQR-D20): the answer comes before the read of the body
      if (statuses[0] === 'early') {
        requests += 1;
        res.writeHead(503, { 'retry-after': '0' }).end('busy');
        return;
      }
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const status = statuses[Math.min(requests, statuses.length - 1)];
        requests += 1;
        // A server or a proxy that closes the connection with no response
        if (status === 'reset') return req.socket.destroy();
        if (status === 503) res.setHeader('Retry-After', '0');
        if (status === 202) {
          // The first part stored, the second part failed, and no item for the other parts.
          // The items echo the Content-Location of the part, as the webserver does.
          const body = Buffer.concat(chunks).toString('latin1');
          const locations = [...body.matchAll(/Content-Location: (.*)\r\n/g)].map(m => m[1]);
          const echo = location =>
            echoLocation ? { '00091001': { vr: 'LO', Value: [location] } } : {};
          const stored = echo(locations[0]);
          const failed = { ...echo(locations[1]), '00081197': { vr: 'US', Value: [0xc000] } };
          res.writeHead(202, { 'content-type': 'application/dicom+json' }).end(
            JSON.stringify({
              '00081199': { vr: 'SQ', Value: [stored] },
              '00081198': { vr: 'SQ', Value: [failed] },
            })
          );
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
    waits = [];
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // The retry wait records its time, and does not wait
  const stow = () =>
    stowMain([dir], {
      url: `http://127.0.0.1:${server.address().port}/studies`,
      quiet: true,
      retryWait: async ms => {
        waits.push(ms);
      },
    });

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
    // Retry-After: 0 of the 503, and 10 s (DEFAULT_RETRY_AFTER_SECONDS) after a reset
    expect(waits).toEqual(Array(requestCount - 1).fill(codes[0] === 'reset' ? 10000 : 0));
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

  // Test 66. The user experience must have this (SQR-U5, SQR-D21): after a 202, a file with
  // no item in the response (a part that the server did not start) counts as failed
  it('counts a file with no item in a 202 as failed', async () => {
    fs.writeFileSync(path.join(dir, 'b.dcm'), 'data');
    fs.writeFileSync(path.join(dir, 'c.dcm'), 'data');
    statuses = [202];
    const results = await stow();
    expect(requests).toBe(1);
    expect(results).toMatchObject({ success: 1, failed: 2 });
    expect(results.errors.map(({ file }) => path.basename(file))).toEqual(['b.dcm', 'c.dcm']);
  });

  // Test 67. The user experience must have this (SQR-U5): files with the same base name in
  // different directories count as stored only when the 202 lists them. With no
  // Content-Location in the items (a different server), the number of items decides.
  it.each([
    ['with', true],
    ['without', false],
  ])('counts files with the same base name %s a Content-Location in the 202', async (_, echo) => {
    fs.rmSync(path.join(dir, 'a.dcm'));
    const files = ['s0', 's1', 's2', 's3'].map(sub => {
      fs.mkdirSync(path.join(dir, sub));
      fs.writeFileSync(path.join(dir, sub, 'a.dcm'), 'data');
      return path.join(dir, sub, 'a.dcm');
    });
    echoLocation = echo;
    statuses = [202];
    const results = await stow();
    expect(requests).toBe(1);
    expect(results).toMatchObject({ success: 1, failed: 3 });
    if (echo) {
      expect(results.errors.map(({ file }) => path.resolve(file))).toEqual(files.slice(1));
    }
  });

  /** Records each file stream of a body; `fail` gives the name of a file that cannot open */
  const recordFileStreams = (fail = null) => {
    const streams = [];
    const createReadStream = fs.createReadStream;
    jest.spyOn(fs, 'createReadStream').mockImplementation((file, ...rest) => {
      const stream =
        path.basename(file) === fail
          ? new Readable({
              read() {
                this.destroy(
                  Object.assign(new Error(`EACCES: open '${file}'`), { code: 'EACCES' })
                );
              },
            })
          : createReadStream(file, ...rest);
      streams.push(stream);
      return stream;
    });
    return streams;
  };

  // Test 61. The user experience must have this (SQR-D20): after a 503 that comes before the
  // end of the body, the stow command closes the file of the body at once, and not when the
  // server closes the connection (keepAliveTimeout, 5 s)
  it('closes the file of the body after a 503 before the end of the body', async () => {
    const file = path.join(dir, 'big.dcm');
    fs.writeFileSync(file, Buffer.alloc(8 * 1024 * 1024));
    statuses = ['early'];
    const streams = recordFileStreams();

    await expect(
      stowFiles(
        [{ filePath: file, fileSize: 8 * 1024 * 1024 }],
        `http://127.0.0.1:${server.address().port}/studies`
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(streams).toHaveLength(1);
    for (let i = 0; i < 100 && !streams[0].closed; i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(streams[0].closed).toBe(true);
  });

  // Test 62. The user experience must have this (SQR-U5): a file that the stow command cannot
  // open fails its group, and the command continues with the other groups, with no crash
  it('counts a group with a file that cannot open as failed', async () => {
    fs.writeFileSync(path.join(dir, 'b.dcm'), 'data');
    statuses = [200];
    recordFileStreams('b.dcm');
    const results = await stowMain([dir], {
      url: `http://127.0.0.1:${server.address().port}/studies`,
      quiet: true,
      sendAsSingleFiles: true,
    });
    expect(results).toMatchObject({ success: 1, failed: 1 });
    expect(results.errors.map(({ file }) => path.basename(file))).toEqual(['b.dcm']);
    expect(results.errors[0].error).toContain('EACCES');
    expect(process.exit).not.toHaveBeenCalled();
  });
});
