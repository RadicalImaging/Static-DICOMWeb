import { PassThrough } from 'stream';
import { createVerboseLog } from '@radicalimaging/static-wado-util';
import { multipartStream } from '../../lib/controllers/server/multipartStream.mjs';
import { TrackableReadBufferStream } from '../../lib/controllers/server/TrackableReadBufferStream.mjs';

createVerboseLog(false, { quiet: true });

const BOUNDARY = 'multipart-stream-test-boundary';

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
});
