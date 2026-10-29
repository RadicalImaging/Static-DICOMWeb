import { PassThrough } from 'stream';
import { createVerboseLog } from '@radicalimaging/static-wado-util';
import { multipartStream } from '../../lib/controllers/server/multipartStream.mjs';
import { TrackableReadBufferStream } from '../../lib/controllers/server/TrackableReadBufferStream.mjs';

createVerboseLog(false, { quiet: true });

const BOUNDARY = 'multipart-stream-test-boundary';
const MINUTE = 60 * 1000;

describe('multipartStream', () => {
  // The user experience must have this: the stored part has exactly the bytes of the upload,
  // also when the request arrives in small chunks (small Buffers share the Node.js pool)
  it('gives each part exactly its bytes when the request arrives in small chunks', async () => {
    const payload = Buffer.alloc(20000);
    payload.forEach((_, i) => (payload[i] = i % 251));
    const body = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
      payload,
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const req = new PassThrough();
    req.headers = { 'content-type': `multipart/related; boundary=${BOUNDARY}` };
    const res = { headersSent: false, status: () => res, send: () => res };
    const middleware = multipartStream({
      listener: async () => undefined,
      // No back pressure: the listener reads nothing
      createBufferStream: () =>
        new TrackableReadBufferStream(null, true, {
          noCopy: true,
          backpressureMaxBytes: Number.MAX_SAFE_INTEGER,
        }),
    });

    const done = new Promise(resolve => middleware(req, res, resolve));
    for (let offset = 0; offset < body.length; offset += 1000) {
      req.write(body.subarray(offset, offset + 1000));
      await new Promise(resolve => setImmediate(resolve));
    }
    req.end();
    await done;

    const [{ stream }] = req.uploadStreams;
    expect(stream.size).toBe(payload.length);
    expect(Buffer.from(stream.getBuffer(0, stream.size)).equals(payload)).toBe(true);
  });

  // Test 37. The user experience must have this: after the 5-minute wait for the listeners, an
  // instance that commits is reported as stored, and an unknown result gives 503, never 400
  it.each([
    ['reports each instance when the listener settles after the wait', 5.5 * MINUTE, 'next'],
    ['answers 503 with Retry-After when the listener does not settle', 10 * MINUTE, 503],
  ])('%s', async (_, listenerMs, expected) => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const body = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
      Buffer.alloc(100),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const req = new PassThrough();
    req.headers = { 'content-type': `multipart/related; boundary=${BOUNDARY}` };
    const headers = {};
    let resolveResult;
    const result = new Promise(resolve => {
      resolveResult = resolve;
    });
    const res = {
      headersSent: false,
      setHeader: (name, value) => (headers[name] = value),
      status: code => {
        resolveResult(code);
        return res;
      },
      send: () => res,
    };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'trace').mockImplementation(() => {});
    let timer;
    const middleware = multipartStream({
      listener: () =>
        new Promise(resolve => {
          timer = setTimeout(() => resolve('committed'), listenerMs);
        }),
      createBufferStream: () => new TrackableReadBufferStream(null, true, { noCopy: true }),
    });

    middleware(req, res, () => resolveResult('next'));
    req.end(body);
    // Let the parts complete, so that the wait for the listeners starts at time 0
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
    expect(timer).toBeDefined();
    await jest.advanceTimersByTimeAsync(7 * MINUTE);

    try {
      expect(await result).toBe(expected);
      if (expected === 'next') {
        expect(await Promise.all(req.uploadListenerPromises)).toEqual(['committed']);
      } else {
        expect(headers['Retry-After']).toBe('10');
      }
    } finally {
      clearTimeout(timer);
      jest.useRealTimers();
      jest.restoreAllMocks();
    }
  });

  /** A response mock that resolves `result` with the first status code */
  const createResponse = () => {
    const headers = {};
    let resolveResult;
    const result = new Promise(resolve => {
      resolveResult = resolve;
    });
    const res = {
      headersSent: false,
      headers,
      result,
      resolveResult,
      setHeader: (name, value) => (headers[name] = value),
      status: code => {
        resolveResult(code);
        return res;
      },
      send: () => res,
    };
    return res;
  };

  const dicomPart = (bytes = 100) =>
    Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
      Buffer.alloc(bytes),
      Buffer.from('\r\n'),
    ]);

  // Test 49. The user experience must have this (SQR-U5): a malformed part header in the
  // middle of the body gives 400, and never a report that leaves out the later parts
  it('answers 400 for a malformed part header before the body ends', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'trace').mockImplementation(() => {});
    const req = new PassThrough();
    req.headers = { 'content-type': `multipart/related; boundary=${BOUNDARY}` };
    const res = createResponse();
    const listened = [];
    const middleware = multipartStream({
      listener: async fileInfo => listened.push(fileInfo.fieldname),
      createBufferStream: () => new TrackableReadBufferStream(null, true, { noCopy: true }),
    });

    try {
      middleware(req, res, () => res.resolveResult('next'));
      req.write(dicomPart());
      // A folded first header line. Dicer parses a header only when body bytes follow it.
      req.write(
        Buffer.from(`--${BOUNDARY}\r\n Content-Type: application/dicom\r\n\r\n${'x'.repeat(100)}`)
      );
      await new Promise(resolve => setTimeout(resolve, 50));
      if (!req.destroyed) req.end(Buffer.concat([dicomPart(), Buffer.from(`--${BOUNDARY}--\r\n`)]));

      expect(await res.result).toBe(400);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
