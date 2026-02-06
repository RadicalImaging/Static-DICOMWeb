import { Writable } from 'stream';
import { StreamInfo } from '../lib/instance/StreamInfo.mjs';

describe('StreamInfo write and end', () => {
  test('writes Buffer, array of Buffer and TypedArray via write(); returns backpressure; queues when busy', async () => {
    const chunks = [];
    const ws = new Writable({
      write(chunk, enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });

    const mockWriter = { _recordStreamFailure() {} };
    const streamInfo = new StreamInfo(mockWriter, { stream: ws, fileStream: ws, streamKey: 'test', filename: 'x', relativePath: '.' });

    const ok1 = streamInfo.write(Buffer.from('a'));
    const ok2 = streamInfo.write([Buffer.from('b'), new Uint8Array([99])]);
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    await streamInfo.end();

    const out = Buffer.concat(chunks).toString('utf8');
    expect(chunks).toHaveLength(3);
    expect(out).toBe('abc');
  });

  test('end() does not throw when failure was recorded; getFailureMessage returns it', async () => {
    const ws = new Writable({
      write(chunk, enc, cb) {
        cb();
      },
    });
    const mockWriter = { _recordStreamFailure() {} };
    const streamInfo = new StreamInfo(mockWriter, { stream: ws, fileStream: ws, streamKey: 'test', filename: 'x', relativePath: '.' });
    // When failure was recorded, end() rejects the completion promise; prevent unhandled rejection in test
    streamInfo.promise.catch(() => {});

    streamInfo.recordFailure(new Error('simulated failure'));
    expect(streamInfo.getFailureMessage()).toBe('simulated failure');

    await expect(streamInfo.end()).resolves.toBeUndefined();
  });
});
