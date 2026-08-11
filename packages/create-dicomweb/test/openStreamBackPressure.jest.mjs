import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import { DicomWebWriter } from '../lib/instance/DicomWebWriter.mjs';
import { FileDicomWebWriter } from '../lib/instance/FileDicomWebWriter.mjs';
import { MultipartResponseDicomWebWriter } from '../lib/instance/MultipartResponseDicomWebWriter.mjs';
import { StreamInfo } from '../lib/instance/StreamInfo.mjs';
import { instanceFromStream } from '../lib/instance/instanceFromStream.mjs';

const packageRoot = process.cwd().endsWith('create-dicomweb')
  ? process.cwd()
  : path.resolve(process.cwd(), 'packages/create-dicomweb');

/** Resolves on the next event loop turn, so stream finish/close callbacks are delivered */
const tick = () => new Promise(resolve => setImmediate(resolve));

describe('open stream back pressure', () => {
  let informationProvider;
  let writer;
  let tempDir;

  beforeEach(() => {
    informationProvider = {
      studyInstanceUid: '1.2.3.4.5',
      seriesInstanceUid: '1.2.3.4.6',
      sopInstanceUid: '1.2.3.4.7',
      transferSyntaxUid: '1.2.840.10008.1.2.4.50', // JPEG baseline, so frames are not gzipped
    };
    tempDir = path.join(packageRoot, 'tmp/back-pressure-test');
    writer = new FileDicomWebWriter(informationProvider, {
      baseDir: tempDir,
      maxOpenStreams: 4,
    });
  });

  /** Files still sitting in the writer's temp directory, i.e. written but never moved */
  const listTempFiles = () => {
    const writerTempDir = path.join(tempDir, 'studies', '1.2.3.4.5', 'temp');
    return fs.existsSync(writerTempDir) ? fs.readdirSync(writerTempDir) : [];
  };

  /** Final directory frames are moved into once their stream closes */
  const framesDir = () =>
    path.join(
      tempDir,
      'studies',
      '1.2.3.4.5',
      'series',
      '1.2.3.4.6',
      'instances',
      '1.2.3.4.7',
      'frames'
    );

  afterEach(async () => {
    for (const streamKey of Array.from(writer.getOpenStreams().keys())) {
      await writer.closeStream(streamKey).catch(() => {});
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('awaitOpenStreamLimit waits until a stream closes, then resolves', async () => {
    for (let frameNumber = 1; frameNumber <= 4; frameNumber++) {
      writer.openFrameStream(frameNumber).write(Buffer.from(`frame ${frameNumber}`));
    }
    expect(writer.getOpenStreams().size).toBe(4);

    let resolved = false;
    const waiting = writer.awaitOpenStreamLimit(4, 5000).then(count => {
      resolved = true;
      return count;
    });

    // At the limit, so the reader must wait rather than open a fifth file
    await tick();
    await tick();
    expect(resolved).toBe(false);

    await writer.closeStream('frame:1');
    const openCount = await waiting;
    expect(resolved).toBe(true);
    expect(openCount).toBeLessThan(4);
  });

  test('awaitOpenStreamLimit returns immediately when below the limit', async () => {
    writer.openFrameStream(1).write(Buffer.from('frame 1'));
    await expect(writer.awaitOpenStreamLimit(4, 5000)).resolves.toBe(1);
  });

  test('awaitOpenStreamLimit gives up after the timeout instead of hanging', async () => {
    for (let frameNumber = 1; frameNumber <= 4; frameNumber++) {
      writer.openFrameStream(frameNumber).write(Buffer.from(`frame ${frameNumber}`));
    }
    // Nothing is ever closed, so this can only resolve via the timeout
    await expect(writer.awaitOpenStreamLimit(4, 50)).resolves.toBe(4);
    expect(writer.getOpenStreams().size).toBe(4);
  });

  test('awaitOpenStreamLimit is not gated by a stream that never closes', async () => {
    // frame:1 is opened first and never closed, standing in for the stream the caller is
    // still writing when the drain runs. Waiting on it alone would stall for the full
    // timeout even though room becomes available immediately.
    for (let frameNumber = 1; frameNumber <= 4; frameNumber++) {
      writer.openFrameStream(frameNumber).write(Buffer.from(`frame ${frameNumber}`));
    }

    const waiting = writer.awaitOpenStreamLimit(4, 3000);
    await writer.closeStream('frame:2');

    const tooSlow = new Promise(resolve => setTimeout(() => resolve('TIMED_OUT'), 500));
    await expect(Promise.race([waiting, tooSlow])).resolves.toBe(3);
  });

  test('awaitOpenStreamLimit is not gated by streams whose close bookkeeping is outstanding', async () => {
    const noQuiet = jest.spyOn(console, 'noQuiet').mockImplementation(() => {});
    try {
      // frame:1 stands in for the stream the caller is still writing: it cannot close until the
      // drain returns. The other three have flushed all of their data but nothing has removed
      // them from the map yet, so waiting on frame:1 alone would stall for the whole timeout.
      writer.openFrameStream(1).write(Buffer.from('frame 1'));
      for (let frameNumber = 2; frameNumber <= 4; frameNumber++) {
        const streamInfo = writer.openFrameStream(frameNumber);
        streamInfo.write(Buffer.from(`frame ${frameNumber}`));
        await streamInfo.end();
      }
      expect(writer.getOpenStreams().size).toBe(4);

      const tooSlow = new Promise(resolve => setTimeout(() => resolve('TIMED_OUT'), 500));
      await expect(Promise.race([writer.awaitOpenStreamLimit(4, 3000), tooSlow])).resolves.toBe(4);

      // It returned because there was room, not because it gave up; reporting a timeout here
      // would be one false alarm per frame on a whole slide image
      expect(noQuiet).not.toHaveBeenCalledWith(expect.stringContaining('back pressure timed out'));
    } finally {
      noQuiet.mockRestore();
    }
  });

  test('awaitOpenStreamLimit reports the timeout when it does give up', async () => {
    const noQuiet = jest.spyOn(console, 'noQuiet').mockImplementation(() => {});
    try {
      for (let frameNumber = 1; frameNumber <= 4; frameNumber++) {
        writer.openFrameStream(frameNumber).write(Buffer.from(`frame ${frameNumber}`));
      }

      const waiting = writer.awaitOpenStreamLimit(4, 3000);
      await writer.closeStream('frame:1');
      await waiting;
      expect(noQuiet).not.toHaveBeenCalledWith(expect.stringContaining('back pressure timed out'));

      // Three frames still writing and nothing closing them, so this can only time out
      await expect(writer.awaitOpenStreamLimit(3, 50)).resolves.toBe(3);
      expect(noQuiet).toHaveBeenCalledWith(expect.stringContaining('back pressure timed out'));
    } finally {
      noQuiet.mockRestore();
    }
  });

  test('an unusable maxOpenStreams falls back to the default rather than removing the limit', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Math.max(4, NaN) is NaN, and every comparison against NaN is false, so this used to
      // leave the file handle count unbounded
      for (const maxOpenStreams of ['many', Number.NaN, 0, -8]) {
        const badWriter = new FileDicomWebWriter(informationProvider, {
          baseDir: tempDir,
          maxOpenStreams,
        });
        expect(badWriter.maxOpenStreams).toBe(32);
      }
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('maxOpenStreams'));

      // Below the minimum is raised to it: the stream being written is itself open
      const tinyWriter = new FileDicomWebWriter(informationProvider, {
        baseDir: tempDir,
        maxOpenStreams: 1,
      });
      expect(tinyWriter.maxOpenStreams).toBe(4);
    } finally {
      warn.mockRestore();
    }
  });

  test('a write error is not left as an unhandled rejection when there is no tracker', async () => {
    // The tracker is what used to attach a handler to the completion promise, so writers
    // created without one (part10 multipart output, for example) turned an I/O error into an
    // unhandledRejection that takes the process down.
    expect(writer.streamWritePromiseTracker).toBeNull();
    const unhandled = [];
    const onUnhandled = reason => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const streamInfo = writer.openStream('bulkdata', 'boom.bin', { streamKey: 'bulkdata:boom' });
      streamInfo.write(Buffer.from('some data'));
      streamInfo.fileStream.destroy(new Error('EIO'));
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(writer.hasStreamErrors()).toBe(true);
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  test('re-using a frame streamKey warns that one of the frames is overwritten', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Bulkdata keys carry a content hash, so a duplicate rewrites identical bytes
      writer.openStream('bulkdata', 'duplicate.bin', { streamKey: 'bulkdata:dup' });
      writer.openStream('bulkdata', 'duplicate.bin', { streamKey: 'bulkdata:dup' });
      expect(warn).not.toHaveBeenCalled();

      // A duplicate frame key means two different frames racing for frames/1.mht
      const first = writer.openFrameStream(1);
      const second = writer.openFrameStream(1);
      expect(second.streamKey).not.toBe(first.streamKey);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('frame:1'));
    } finally {
      warn.mockRestore();
    }
  });

  test('re-using a streamKey that is still open does not orphan the first stream', async () => {
    const first = writer.openStream('bulkdata', 'duplicate.bin', { streamKey: 'bulkdata:dup' });
    const second = writer.openStream('bulkdata', 'duplicate.bin', { streamKey: 'bulkdata:dup' });

    expect(first.streamKey).toBe('bulkdata:dup');
    expect(second.streamKey).not.toBe('bulkdata:dup');
    expect(writer.getOpenStreams().size).toBe(2);
    expect(writer.getOpenStreams().get(first.streamKey)).toBe(first);
    expect(writer.getOpenStreams().get(second.streamKey)).toBe(second);

    first.write(Buffer.from('first'));
    second.write(Buffer.from('second'));

    await writer.closeStream(first.streamKey);
    await writer.closeStream(second.streamKey);
    expect(writer.getOpenStreams().size).toBe(0);
  });

  test('drainOpenStreams flushes in-flight closes', async () => {
    for (let frameNumber = 1; frameNumber <= 3; frameNumber++) {
      writer.openFrameStream(frameNumber).write(Buffer.from(`frame ${frameNumber}`));
      // Close without awaiting, exactly like the frame/bulkdata filters do
      writer.closeStream(`frame:${frameNumber}`);
    }

    await writer.drainOpenStreams(5000);

    expect(writer.getOpenStreams().size).toBe(0);
    expect(fs.readdirSync(framesDir()).sort()).toEqual(['1.mht', '2.mht', '3.mht']);
  });

  test('drainOpenStreams destroys streams that were never closed', async () => {
    const streamInfo = writer.openFrameStream(1);
    streamInfo.write(Buffer.from('frame 1'));
    streamInfo.promise.catch(() => {});

    await writer.drainOpenStreams(50);

    expect(writer.getOpenStreams().size).toBe(0);
    expect(streamInfo.stream.destroyed).toBe(true);
    expect(writer.hasStreamErrors()).toBe(true);
    // Destroying the stream must not leave its half written temp file behind
    expect(listTempFiles()).toEqual([]);
  });

  test('drainOpenStreams finishes the close of streams that ended without it', async () => {
    const streamInfo = writer.openFrameStream(1);
    streamInfo.write(Buffer.from('frame 1'));
    // end() without closeStream: the stream is flushed and its descriptor is on the way out,
    // but nothing has removed it from the open map yet.
    await streamInfo.end();
    expect(writer.getOpenStreams().size).toBe(1);

    await writer.drainOpenStreams(5000);

    // Not reported as never closed, so a reused writer does not carry it against
    // maxOpenStreams forever
    expect(writer.getOpenStreams().size).toBe(0);
    expect(writer.hasStreamErrors()).toBe(false);
    // The bytes were written, so the frame has to reach its final path rather than being
    // abandoned in the temp directory
    expect(fs.existsSync(path.join(framesDir(), '1.mht'))).toBe(true);
    expect(listTempFiles()).toEqual([]);
  });

  test('drainOpenStreams keeps waiting while closes are slow but still completing', async () => {
    // Each close takes longer than the drain timeout allows in total, but none of them stalls
    // for that long on its own. A timeout measured across the whole drain would destroy the
    // last two streams - and destroying a stream discards the frame it was writing.
    const completionDelayMs = 120;
    const drainTimeoutMs = 200;

    class SlowClosingWriter extends DicomWebWriter {
      _openStream(relativePath, filename) {
        const stream = new Writable({
          write(chunk, enc, callback) {
            callback();
          },
          final(callback) {
            setTimeout(callback, completionDelayMs);
          },
        });
        return { stream, fileStream: stream, filename, relativePath };
      }
    }

    const slowWriter = new SlowClosingWriter(informationProvider, { baseDir: tempDir });
    const streamKeys = ['a', 'b', 'c'];
    for (const streamKey of streamKeys) {
      slowWriter.openStream('bulkdata', `${streamKey}.bin`, { streamKey }).write(Buffer.from('x'));
    }

    // Closes start one after another, so completions arrive ~120ms apart over ~360ms total
    streamKeys.forEach((streamKey, index) => {
      setTimeout(() => {
        slowWriter.closeStream(streamKey);
      }, index * completionDelayMs);
    });

    await slowWriter.drainOpenStreams(drainTimeoutMs);

    expect(slowWriter.getOpenStreams().size).toBe(0);
    expect(slowWriter.getStreamErrorSummary()).toEqual([]);
  });
});

describe('MultipartResponseDicomWebWriter finalization', () => {
  /** Minimal Express-like response that records what was written */
  const createResponse = () => ({
    chunks: [],
    headers: {},
    writableEnded: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    write(chunk, encoding, callback) {
      this.chunks.push(String(chunk));
      if (typeof encoding === 'function') encoding();
      else callback?.();
      return true;
    },
    end(callback) {
      this.writableEnded = true;
      callback?.();
    },
  });

  const informationProvider = {
    studyInstanceUid: '1.2.3.4.5',
    seriesInstanceUid: '1.2.3.4.6',
    sopInstanceUid: '1.2.3.4.7',
  };

  test('drainOpenStreams ends the response even though the stream never reached closeStream', async () => {
    const response = createResponse();
    const writer = new MultipartResponseDicomWebWriter(informationProvider, { response });

    const streamInfo = await writer.openInstanceStream('instance.dcm');
    streamInfo.write(Buffer.from('DICM'));
    await streamInfo.end();
    expect(response.writableEnded).toBe(false);

    await writer.drainOpenStreams(5000);

    expect(writer.getOpenStreams().size).toBe(0);
    expect(response.writableEnded).toBe(true);
    expect(response.chunks.join('')).toContain(`--${writer._getBoundary()}--`);
  });

  test('the closing boundary is written once, however the last stream finishes', async () => {
    const response = createResponse();
    const writer = new MultipartResponseDicomWebWriter(informationProvider, { response });

    const streamInfo = await writer.openInstanceStream('instance.dcm');
    streamInfo.write(Buffer.from('DICM'));
    await writer.closeStream(streamInfo.streamKey);
    await writer.drainOpenStreams(5000);

    const closing = `--${writer._getBoundary()}--`;
    expect(response.chunks.join('').split(closing)).toHaveLength(2);
    expect(response.writableEnded).toBe(true);
  });
});

describe('StreamInfo back pressure', () => {
  test('repeated back pressure does not accumulate drain listeners', async () => {
    // Holds back the write callbacks, so every write() reports back pressure and each queued
    // chunk has to wait out the drain timeout
    let releaseWrites = false;
    const pending = [];
    const ws = new Writable({
      highWaterMark: 1,
      write(chunk, enc, cb) {
        if (releaseWrites) {
          cb();
          return;
        }
        pending.push(cb);
      },
    });

    const mockWriter = { _recordStreamFailure() {} };
    const streamInfo = new StreamInfo(mockWriter, {
      stream: ws,
      fileStream: ws,
      streamKey: 'test',
      filename: 'x',
      relativePath: '.',
    });

    for (let i = 0; i < 4; i++) {
      streamInfo.write(Buffer.from(`chunk ${i}`));
    }

    // Let the queue hit back pressure and time out its drain waits a couple of times
    await new Promise(resolve => setTimeout(resolve, 700));
    expect(ws.listenerCount('drain')).toBeLessThanOrEqual(1);
    expect(ws.listenerCount('close')).toBeLessThanOrEqual(1);

    releaseWrites = true;
    pending.forEach(cb => cb());
    await streamInfo.end();
  });

  test('a stream error is recorded rather than left open or thrown', async () => {
    const ws = new Writable({
      write(chunk, enc, cb) {
        cb(new Error('disk full'));
      },
    });

    const failures = [];
    const mockWriter = {
      _recordStreamFailure(streamKey, info, error) {
        failures.push(error.message);
      },
    };
    const streamInfo = new StreamInfo(mockWriter, {
      stream: ws,
      fileStream: ws,
      streamKey: 'test',
      filename: 'x',
      relativePath: '.',
    });
    streamInfo.promise.catch(() => {});

    streamInfo.write(Buffer.from('data'));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(failures).toEqual(['disk full']);
    expect(streamInfo.failed).toBe(true);
    // end() must still complete (an errored stream never emits 'finish')
    await expect(streamInfo.end()).resolves.toBeUndefined();
  });
});

describe('instanceFromStream back pressure wiring', () => {
  const dicomFilePath = path.resolve(
    packageRoot,
    '../../packages/static-wado-creator/dicom/jpeg8bit.dcm'
  );
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(packageRoot, 'tmp/back-pressure-instance');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('the writer shares the tracker the drain waits on, and no stream is left open', async () => {
    const writerOptionsSeen = [];
    class RecordingWriter extends FileDicomWebWriter {
      constructor(informationProvider, options) {
        super(informationProvider, options);
        writerOptionsSeen.push(options);
      }
    }

    const result = await instanceFromStream(fs.createReadStream(dicomFilePath), {
      dicomdir: tempDir,
      DicomWebWriter: RecordingWriter,
      maxOpenStreams: 4,
      drainMaxUnsettled: 2,
    });

    expect(writerOptionsSeen).toHaveLength(1);
    const tracker = writerOptionsSeen[0].streamWritePromiseTracker;
    expect(tracker).toBeDefined();
    expect(writerOptionsSeen[0].maxOpenStreams).toBe(4);
    expect(result.writer.streamWritePromiseTracker).toBe(tracker);
    expect(result.writer.maxOpenStreams).toBe(4);

    // Every stream the writer opened was registered with the tracker used for back pressure,
    // and all of them settled - that is what makes the drain able to push back.
    expect(tracker.getSettledCount()).toBeGreaterThan(0);
    expect(tracker.getUnsettledCount()).toBe(0);
    expect(result.writer.getOpenStreams().size).toBe(0);
  });

  test('the unsettled write gate is never tighter than the open file limit', async () => {
    // Every stream promise is registered with the tracker, so unsettled writes and open streams
    // are largely the same set. A 25 write gate in front of a 64 file limit would bind first,
    // making --max-open-files 64 do nothing at the cost of a drain timeout per attempt.
    const limits = [];
    const tracker = {
      add: promise => promise,
      limitUnsettled(maxUnsettled) {
        limits.push(maxUnsettled);
        return Promise.resolve(0);
      },
      getUnsettledCount: () => 0,
      getSettledCount: () => 0,
      getTrackerId: () => 'test-tracker',
    };

    const result = await instanceFromStream(fs.createReadStream(dicomFilePath), {
      dicomdir: tempDir,
      streamWritePromiseTracker: tracker,
      maxOpenStreams: 64,
    });

    expect(result.writer.maxOpenStreams).toBe(64);
    expect(limits.length).toBeGreaterThan(0);
    expect(Math.min(...limits)).toBeGreaterThanOrEqual(64);
  });

  test('a caller supplied tracker is used for the writer as well', async () => {
    const added = [];
    const tracker = {
      add(promise) {
        added.push(promise);
        return promise;
      },
      limitUnsettled: () => Promise.resolve(0),
      getUnsettledCount: () => 0,
      getSettledCount: () => added.length,
      getTrackerId: () => 'test-tracker',
    };

    const result = await instanceFromStream(fs.createReadStream(dicomFilePath), {
      dicomdir: tempDir,
      streamWritePromiseTracker: tracker,
    });

    expect(result.writer.streamWritePromiseTracker).toBe(tracker);
    expect(added.length).toBeGreaterThan(0);
  });
});
