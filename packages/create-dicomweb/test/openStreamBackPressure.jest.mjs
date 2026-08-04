import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import { FileDicomWebWriter } from '../lib/instance/FileDicomWebWriter.mjs';
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
    const framesDir = path.join(
      tempDir,
      'studies',
      '1.2.3.4.5',
      'series',
      '1.2.3.4.6',
      'instances',
      '1.2.3.4.7',
      'frames'
    );
    expect(fs.readdirSync(framesDir).sort()).toEqual(['1.mht', '2.mht', '3.mht']);
  });

  test('drainOpenStreams destroys streams that were never closed', async () => {
    const streamInfo = writer.openFrameStream(1);
    streamInfo.write(Buffer.from('frame 1'));
    streamInfo.promise.catch(() => {});

    await writer.drainOpenStreams(50);

    expect(writer.getOpenStreams().size).toBe(0);
    expect(streamInfo.stream.destroyed).toBe(true);
    expect(writer.hasStreamErrors()).toBe(true);
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
