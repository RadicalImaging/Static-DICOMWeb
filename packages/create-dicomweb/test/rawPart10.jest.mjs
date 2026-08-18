/**
 * Covers the instance-level Part 10 rendition (instances/<sop>/index.mht.gz) written for
 * SEG/SR/parametric-map instances.
 *
 * The rendition is re-created from the parsed dataset and the frame/bulkdata files just
 * written, not from the received bytes - the parse stream releases its buffers as it
 * consumes them. These tests therefore run both entry paths with buffer clearing on (the
 * file-stream path, and a buffer stream standing in for STOW with deferred final moves)
 * and assert the rendition is a parseable Part 10 whose pixel and bulkdata bytes match
 * the source.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { data } from 'dcmjs';
import { instanceFromStream } from '../lib/instance/instanceFromStream.mjs';

const { DicomDict, DicomMessage, DicomMetaDictionary, ReadBufferStream } = data;

const ROWS = 32;
const COLS = 32;
const FRAMES = 4;
/** Above writeBulkdataFilter's 128k public-tag threshold, so this tag becomes a bulkdata file */
const BULK_SIZE = 200 * 1024;
const EXPLICIT_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
const SEG_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.66.4';

const STUDY = '1.2.276.0.9999.1';
const SERIES = '1.2.276.0.9999.1.1';
const SOP = '1.2.276.0.9999.1.1.1';

const pixelBytes = new Uint8Array(ROWS * COLS * FRAMES);
for (let i = 0; i < pixelBytes.length; i++) pixelBytes[i] = (i * 7) & 0xff;
const bulkBytes = new Uint8Array(BULK_SIZE);
for (let i = 0; i < bulkBytes.length; i++) bulkBytes[i] = (i * 13) & 0xff;

/**
 * Builds a minimal multi-frame SEG as an explicit-little-endian Part 10 buffer.
 * @returns {Buffer}
 */
function buildPart10() {
  const fmi = DicomMetaDictionary.denaturalizeDataset({
    MediaStorageSOPClassUID: SEG_SOP_CLASS,
    MediaStorageSOPInstanceUID: SOP,
    TransferSyntaxUID: EXPLICIT_LITTLE_ENDIAN,
    ImplementationClassUID: '2.25.1',
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
  });
  const dicomDict = new DicomDict(fmi);
  dicomDict.dict = {
    '00080016': { vr: 'UI', Value: [SEG_SOP_CLASS] },
    '00080018': { vr: 'UI', Value: [SOP] },
    '00080060': { vr: 'CS', Value: ['SEG'] },
    '0020000D': { vr: 'UI', Value: [STUDY] },
    '0020000E': { vr: 'UI', Value: [SERIES] },
    '00200013': { vr: 'IS', Value: ['1'] },
    '00280002': { vr: 'US', Value: [1] },
    '00280004': { vr: 'CS', Value: ['MONOCHROME2'] },
    '00280008': { vr: 'IS', Value: [String(FRAMES)] },
    '00280010': { vr: 'US', Value: [ROWS] },
    '00280011': { vr: 'US', Value: [COLS] },
    '00280100': { vr: 'US', Value: [8] },
    '00280101': { vr: 'US', Value: [8] },
    '00280102': { vr: 'US', Value: [7] },
    '00280103': { vr: 'US', Value: [0] },
    '00420011': { vr: 'OB', Value: [bulkBytes.buffer] },
    '7FE00010': { vr: 'OW', Value: [pixelBytes.buffer] },
  };
  return Buffer.from(dicomDict.write());
}

/**
 * Extracts the single part of a (gzipped) multipart/related file.
 * @param {string} filePath
 * @returns {{ payload: Buffer, boundary: string, headers: string }}
 */
function unwrapMultipart(filePath) {
  let raw = fs.readFileSync(filePath);
  if (filePath.endsWith('.gz')) raw = zlib.gunzipSync(raw);
  expect(raw.subarray(0, 2).toString('latin1')).toBe('--');
  const firstLineEnd = raw.indexOf('\r\n');
  const headerEnd = raw.indexOf('\r\n\r\n', firstLineEnd);
  const boundary = raw.subarray(2, firstLineEnd).toString('latin1').trim();
  const headers = raw.subarray(firstLineEnd, headerEnd).toString('latin1');
  const start = headerEnd + 4;
  const trailer = Buffer.from(`\r\n--${boundary}--`);
  let end = raw.lastIndexOf(trailer);
  if (end < start) end = raw.length;
  return { payload: raw.subarray(start, end), boundary, headers };
}

/**
 * Flattens a DICOM JSON binary value (one or more ArrayBuffers) to bytes.
 * @param {ArrayBuffer|Array} value
 * @returns {Buffer}
 */
function bytesOf(value) {
  const list = Array.isArray(value) ? value : [value];
  return Buffer.concat(list.map(v => Buffer.from(v)));
}

/**
 * Asserts the stored rendition round-trips to the source instance.
 * @param {string} dicomdir
 */
function expectRendition(dicomdir) {
  const instanceDir = path.join(dicomdir, 'studies', STUDY, 'series', SERIES, 'instances', SOP);
  const renditionPath = path.join(instanceDir, 'index.mht.gz');
  expect(fs.existsSync(renditionPath)).toBe(true);

  const { payload, boundary, headers } = unwrapMultipart(renditionPath);
  expect(boundary).toMatch(/^BOUNDARY_/);
  expect(headers).toContain('application/dicom');

  const reparsed = DicomMessage.readFile(
    payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
  );
  expect(reparsed.dict['00080018'].Value[0]).toBe(SOP);
  expect(reparsed.meta['00020010'].Value[0]).toBe(EXPLICIT_LITTLE_ENDIAN);
  // AvailableTransferSyntaxUID is internal to static-dicomweb and must not be emitted
  expect(reparsed.dict['00083002']).toBeUndefined();

  expect(bytesOf(reparsed.dict['7FE00010'].Value).equals(Buffer.from(pixelBytes))).toBe(true);
  expect(bytesOf(reparsed.dict['00420011'].Value).equals(Buffer.from(bulkBytes))).toBe(true);
}

describe('Part 10 rendition for SEG/SR instances', () => {
  let tempRoot;
  let part10;

  beforeAll(() => {
    part10 = buildPart10();
  });

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-part10-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('writes a re-readable rendition from a file stream', async () => {
    const dicomdir = path.join(tempRoot, 'dicomweb');
    const source = path.join(tempRoot, 'source.dcm');
    fs.writeFileSync(source, part10);

    await instanceFromStream(fs.createReadStream(source), { dicomdir });

    expectRendition(dicomdir);
  });

  it('writes a re-readable rendition from a chunked buffer stream with deferred moves', async () => {
    const dicomdir = path.join(tempRoot, 'dicomweb');
    // Matches the STOW upload stream: buffers released as consumed, temp files only
    // renamed at commitPendingMoves.
    const stream = new ReadBufferStream(null, true, { noCopy: true, clearBuffers: true });
    const promise = instanceFromStream(stream, {
      dicomdir,
      writerOptions: { baseDir: dicomdir, deferFinalMove: true },
    });

    const CHUNK = 64 * 1024;
    for (let offset = 0; offset < part10.length; offset += CHUNK) {
      const slice = part10.subarray(offset, Math.min(offset + CHUNK, part10.length));
      stream.addBuffer(new Uint8Array(slice).buffer);
      await new Promise(resolve => setImmediate(resolve));
    }
    stream.setComplete();
    await promise;

    expectRendition(dicomdir);
  });

  it('skips the rendition for modalities outside the selector', async () => {
    const dicomdir = path.join(tempRoot, 'dicomweb');
    const source = path.join(tempRoot, 'source.dcm');
    const ctDict = new DicomDict(
      DicomMetaDictionary.denaturalizeDataset({
        MediaStorageSOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
        MediaStorageSOPInstanceUID: SOP,
        TransferSyntaxUID: EXPLICIT_LITTLE_ENDIAN,
        ImplementationClassUID: '2.25.1',
        FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
      })
    );
    ctDict.dict = {
      '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] },
      '00080018': { vr: 'UI', Value: [SOP] },
      '00080060': { vr: 'CS', Value: ['CT'] },
      '0020000D': { vr: 'UI', Value: [STUDY] },
      '0020000E': { vr: 'UI', Value: [SERIES] },
      '00280002': { vr: 'US', Value: [1] },
      '00280004': { vr: 'CS', Value: ['MONOCHROME2'] },
      '00280010': { vr: 'US', Value: [ROWS] },
      '00280011': { vr: 'US', Value: [COLS] },
      '00280100': { vr: 'US', Value: [8] },
      '00280101': { vr: 'US', Value: [8] },
      '00280102': { vr: 'US', Value: [7] },
      '00280103': { vr: 'US', Value: [0] },
      '7FE00010': { vr: 'OW', Value: [pixelBytes.slice(0, ROWS * COLS).buffer] },
    };
    fs.writeFileSync(source, Buffer.from(ctDict.write()));

    await instanceFromStream(fs.createReadStream(source), { dicomdir });

    const instanceDir = path.join(dicomdir, 'studies', STUDY, 'series', SERIES, 'instances', SOP);
    expect(fs.existsSync(path.join(instanceDir, 'index.mht.gz'))).toBe(false);
    expect(fs.existsSync(path.join(instanceDir, 'metadata.gz'))).toBe(true);
  });
});
