import { Writable } from 'stream';
import { StreamInfo } from '../lib/instance/StreamInfo.mjs';

describe('StreamInfo writeBinaryValue and end', () => {
  test('writes Buffer, array of Buffer and TypedArray, extend via multiple writeBinaryValue', async () => {
    const chunks = [];
    const ws = new Writable({
      write(chunk, enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });

    const mockWriter = { _recordStreamFailure() {} };
    const streamInfo = new StreamInfo(mockWriter, { stream: ws, fileStream: ws, streamKey: 'test', filename: 'x', relativePath: '.' });

    await streamInfo.writeBinaryValue(Buffer.from('a'));
    await streamInfo.writeBinaryValue([Buffer.from('b'), new Uint8Array([99])]);
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

    streamInfo.recordFailure(new Error('simulated failure'));
    expect(streamInfo.getFailureMessage()).toBe('simulated failure');

    await expect(streamInfo.end()).resolves.toBeUndefined();
  });
});
