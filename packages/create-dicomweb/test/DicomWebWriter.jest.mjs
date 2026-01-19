import fs from 'fs';
import path from 'path';
import { FileDicomWebWriter } from '../lib/instance/FileDicomWebWriter.mjs';

describe('DicomWebWriter', () => {
  let mockInformation;
  let informationProvider;
  let writer;
  let tempDir;

  beforeEach(() => {
    // Create mock information object using camelCase (dcmjs convention)
    informationProvider = {
      studyInstanceUid: '1.2.3.4.5',
      seriesInstanceUid: '1.2.3.4.6',
      sopInstanceUid: '1.2.3.4.7',
      transferSyntaxUid: '1.2.840.10008.1.2.4.50' // JPEG baseline
    };

    const packageRoot = process.cwd().endsWith('create-dicomweb')
      ? process.cwd()
      : path.resolve(process.cwd(), 'packages/create-dicomweb');
    tempDir = path.join(packageRoot, 'tmp/dicomweb-writer-test');
    
    writer = new FileDicomWebWriter(informationProvider, { baseDir: tempDir });
  });

  afterEach(async () => {
    // Close any remaining open streams before cleaning up
    if (writer && writer.getOpenStreams().size > 0) {
      const streamKeys = Array.from(writer.getOpenStreams().keys());
      for (const key of streamKeys) {
        try {
          await writer.closeStream(key);
        } catch (error) {
          // Ignore errors from closing streams
        }
      }
    }
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    test('should create a FileDicomWebWriter instance with informationProvider and options', () => {
      expect(writer).toBeDefined();
      expect(writer.informationProvider).toBe(informationProvider);
      expect(writer.options.baseDir).toBe(tempDir);
      expect(writer.openStreams).toBeDefined();
      expect(writer.openStreams instanceof Map).toBe(true);
    });

    test('should throw error if informationProvider is not provided', () => {
      expect(() => new FileDicomWebWriter(null, { baseDir: tempDir })).toThrow('informationProvider object is required');
    });

    test('should throw error if informationProvider is not an object', () => {
      expect(() => new FileDicomWebWriter('not-an-object', { baseDir: tempDir })).toThrow('informationProvider object is required');
    });

    test('should throw error if options is not provided', () => {
      expect(() => new FileDicomWebWriter(informationProvider, null)).toThrow('options object is required');
    });

    test('should throw error if baseDir is not in options', () => {
      expect(() => new FileDicomWebWriter(informationProvider, {})).toThrow('options.baseDir is required');
    });

    test('should accept additional options', () => {
      const writerWithOptions = new FileDicomWebWriter(informationProvider, {
        baseDir: tempDir,
        customOption: 'value'
      });
      expect(writerWithOptions.options.baseDir).toBe(tempDir);
      expect(writerWithOptions.options.customOption).toBe('value');
    });
  });

  describe('UID Getters', () => {
    test('should get Study UID from information', () => {
      expect(writer.getStudyUID()).toBe('1.2.3.4.5');
    });

    test('should get Series UID from information', () => {
      expect(writer.getSeriesUID()).toBe('1.2.3.4.6');
    });

    test('should get SOP Instance UID from information', () => {
      expect(writer.getSOPInstanceUID()).toBe('1.2.3.4.7');
    });

    test('should get Transfer Syntax UID from information', () => {
      expect(writer.getTransferSyntaxUID()).toBe('1.2.840.10008.1.2.4.50');
    });

    test('should handle dynamic information updates', () => {
      expect(writer.getStudyUID()).toBe('1.2.3.4.5');
      
      // Update the information
      informationProvider.studyInstanceUid = '9.8.7.6.5';
      
      expect(writer.getStudyUID()).toBe('9.8.7.6.5');
    });

    test('should handle missing information gracefully', () => {
      const emptyProvider = {};
      const writerEmpty = new FileDicomWebWriter(emptyProvider, { baseDir: tempDir });
      expect(writerEmpty.getStudyUID()).toBeUndefined();
      expect(writerEmpty.getSeriesUID()).toBeUndefined();
      expect(writerEmpty.getSOPInstanceUID()).toBeUndefined();
      expect(writerEmpty.getTransferSyntaxUID()).toBeUndefined();
    });
  });

  describe('Stream Operations', () => {
    test('should open and close a study-level stream', async () => {
      const streamInfo = await writer.openStudyStream('test.txt');
      expect(streamInfo).toBeDefined();
      expect(streamInfo.filename).toBe('test.txt');
      expect(writer.getOpenStreams().size).toBe(1);

      streamInfo.stream.write('test data');
      
      // Get the actual stream key
      const streamKey = Array.from(writer.getOpenStreams().keys())[0];
      const relativePath = await writer.closeStream(streamKey);
      expect(relativePath).toContain('studies/1.2.3.4.5/test.txt');
      expect(writer.getOpenStreams().size).toBe(0);

      // Verify file was created
      const filepath = path.join(tempDir, 'studies', '1.2.3.4.5', 'test.txt');
      expect(fs.existsSync(filepath)).toBe(true);
    });

    test('should open and close a series-level stream', async () => {
      const streamInfo = await writer.openSeriesStream('series.json');
      expect(streamInfo.filename).toBe('series.json');
      expect(writer.getOpenStreams().size).toBe(1);

      streamInfo.stream.write(JSON.stringify({ test: 'data' }));
      
      const streamKey = Array.from(writer.getOpenStreams().keys())[0];
      const relativePath = await writer.closeStream(streamKey);
      expect(relativePath).toContain('studies/1.2.3.4.5/series/1.2.3.4.6/series.json');
      expect(writer.getOpenStreams().size).toBe(0);

      // Verify file was created
      const filepath = path.join(tempDir, 'studies', '1.2.3.4.5', 'series', '1.2.3.4.6', 'series.json');
      expect(fs.existsSync(filepath)).toBe(true);
    });

    test('should open and close an instance-level stream', async () => {
      const streamInfo = await writer.openInstanceStream('metadata.json');
      expect(streamInfo.filename).toBe('metadata.json');
      expect(writer.getOpenStreams().size).toBe(1);

      streamInfo.stream.write(JSON.stringify({ metadata: 'test' }));
      
      const streamKey = Array.from(writer.getOpenStreams().keys())[0];
      const relativePath = await writer.closeStream(streamKey);
      expect(relativePath).toContain('instances/1.2.3.4.7/metadata.json');
      expect(writer.getOpenStreams().size).toBe(0);

      // Verify file was created
      const filepath = path.join(
        tempDir, 'studies', '1.2.3.4.5', 'series', '1.2.3.4.6', 'instances', '1.2.3.4.7', 'metadata.json'
      );
      expect(fs.existsSync(filepath)).toBe(true);
    });

    test('should open and close a frame-level stream', async () => {
      const streamInfo = await writer.openFrameStream(1);
      expect(streamInfo.frameNumber).toBe(1);
      expect(streamInfo.filename).toMatch(/\.mht$/);
      expect(writer.getOpenStreams().size).toBe(1);

      streamInfo.stream.write(Buffer.from('frame data'));
      
      const streamKey = Array.from(writer.getOpenStreams().keys())[0];
      const relativePath = await writer.closeStream(streamKey);
      expect(relativePath).toContain('frames/');
      expect(writer.getOpenStreams().size).toBe(0);

      // Verify file was created
      const filepath = path.join(
        tempDir, 'studies', '1.2.3.4.5', 'series', '1.2.3.4.6', 
        'instances', '1.2.3.4.7', 'frames', streamInfo.filename
      );
      expect(fs.existsSync(filepath)).toBe(true);
    });

    test('should handle multiple open streams', async () => {
      const stream1 = await writer.openFrameStream(1);
      const stream2 = await writer.openFrameStream(2);
      const stream3 = await writer.openFrameStream(3);

      expect(writer.getOpenStreams().size).toBe(3);

      stream1.stream.write(Buffer.from('frame 1'));
      stream2.stream.write(Buffer.from('frame 2'));
      stream3.stream.write(Buffer.from('frame 3'));

      await writer.closeStream('frame:1');
      expect(writer.getOpenStreams().size).toBe(2);

      await writer.closeStream('frame:2');
      expect(writer.getOpenStreams().size).toBe(1);

      await writer.closeStream('frame:3');
      expect(writer.getOpenStreams().size).toBe(0);
    });

    test('should await all streams with awaitAllStreams', async () => {
      const stream1 = await writer.openFrameStream(1);
      const stream2 = await writer.openFrameStream(2);
      const stream3 = await writer.openFrameStream(3);

      stream1.stream.write(Buffer.from('frame 1'));
      stream2.stream.write(Buffer.from('frame 2'));
      stream3.stream.write(Buffer.from('frame 3'));

      // Close all streams (don't await individually)
      writer.closeStream('frame:1');
      writer.closeStream('frame:2');
      writer.closeStream('frame:3');

      // Now await all of them to complete
      const paths = await writer.awaitAllStreams();
      expect(paths.length).toBe(3);
      expect(writer.getOpenStreams().size).toBe(0);
    });
  });

  describe('Gzip Support', () => {
    test('should gzip file when gzip option is true', async () => {
      const streamInfo = await writer.openInstanceStream('test.json', { gzip: true });
      expect(streamInfo.filename).toBe('test.json.gz');
      expect(streamInfo.gzipped).toBe(true);

      streamInfo.stream.write('test data');
      
      // Get the correct streamKey from the streamInfo
      const streamKey = Array.from(writer.getOpenStreams().keys())[0];
      await writer.closeStream(streamKey);

      const filepath = path.join(
        tempDir, 'studies', '1.2.3.4.5', 'series', '1.2.3.4.6', 
        'instances', '1.2.3.4.7', 'test.json.gz'
      );
      expect(fs.existsSync(filepath)).toBe(true);
    });

    test('should not gzip by default', async () => {
      const streamInfo = await writer.openInstanceStream('test.json');
      expect(streamInfo.filename).toBe('test.json');
      expect(streamInfo.gzipped).toBe(false);
    });

    test('should auto-gzip frames with uncompressed transfer syntax', async () => {
      // Change to uncompressed transfer syntax
      informationProvider.transferSyntaxUid = '1.2.840.10008.1.2'; // Implicit VR Little Endian

      const streamInfo = await writer.openFrameStream(1);
      expect(streamInfo.filename).toMatch(/\.mht\.gz$/);
      expect(streamInfo.gzipped).toBe(true);
    });

    test('should not gzip frames with compressed transfer syntax', async () => {
      // JPEG baseline is compressed
      const streamInfo = await writer.openFrameStream(1);
      expect(streamInfo.filename).toMatch(/\.mht$/);
      expect(streamInfo.filename).not.toMatch(/\.gz$/);
      expect(streamInfo.gzipped).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should return undefined when closing non-existent stream', async () => {
      const result = await writer.closeStream('nonexistent');
      expect(result).toBeUndefined();
    });

    test('should throw error when studyInstanceUid is missing', async () => {
      informationProvider.studyInstanceUid = null;
      await expect(writer.openStudyStream('test.txt')).rejects.toThrow('StudyInstanceUID is required');
    });

    test('should throw error when seriesInstanceUid is missing for series stream', async () => {
      informationProvider.seriesInstanceUid = null;
      await expect(writer.openSeriesStream('test.txt')).rejects.toThrow('SeriesInstanceUID');
    });

    test('should throw error when sopInstanceUid is missing for instance stream', async () => {
      informationProvider.sopInstanceUid = null;
      await expect(writer.openInstanceStream('test.txt')).rejects.toThrow('SOPInstanceUID');
    });
  });
});
