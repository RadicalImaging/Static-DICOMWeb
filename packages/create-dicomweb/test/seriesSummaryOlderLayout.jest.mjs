import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { seriesSummary } from '../lib/instance/SeriesSummary.mjs';
import { FileDicomWebReader } from '../lib/instance/FileDicomWebReader.mjs';

/**
 * Studies imported by older static-wado versions store instance metadata as
 * instances/<sop>/metadata/index.json.gz instead of instances/<sop>/metadata.gz.
 * Regenerating such a series must read that layout, and must never replace good
 * series metadata with [].
 */

const STUDY_UID = '1.2.3';
const SERIES_UID = '1.2.3.4';

function instanceJson(sopUID, instanceNumber) {
  return {
    '0020000D': { vr: 'UI', Value: [STUDY_UID] },
    '0020000E': { vr: 'UI', Value: [SERIES_UID] },
    '00080018': { vr: 'UI', Value: [sopUID] },
    '00080016': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] },
    '00080060': { vr: 'CS', Value: ['CT'] },
    '00200013': { vr: 'IS', Value: [instanceNumber] },
    '7FE00010': { vr: 'OB', BulkDataURI: './frames' },
  };
}

function writeGzJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(JSON.stringify(data)));
}

function readGzJson(filePath) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf-8'));
}

function sopUIDs(metadata) {
  return metadata.map(instance => instance['00080018'].Value[0]);
}

describe('seriesSummary with the older instance layout', () => {
  let baseDir;
  let seriesDir;
  let processErrors;
  const onProcessError = error => processErrors.push(error);

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'series-older-layout-'));
    seriesDir = path.join(baseDir, 'studies', STUDY_UID, 'series', SERIES_UID);
    processErrors = [];
    process.on('uncaughtException', onProcessError);
    process.on('unhandledRejection', onProcessError);
  });

  afterEach(() => {
    process.off('uncaughtException', onProcessError);
    process.off('unhandledRejection', onProcessError);
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  function writeOlderLayoutInstance(sopUID, instanceNumber) {
    writeGzJson(
      path.join(seriesDir, 'instances', sopUID, 'metadata', 'index.json.gz'),
      [instanceJson(sopUID, instanceNumber)]
    );
  }

  it('reads instances/<sop>/metadata/index.json.gz through the reader', async () => {
    writeOlderLayoutInstance('1.2.3.4.1', 1);
    const reader = new FileDicomWebReader(baseDir);
    const instancePath = reader.getInstancePath(STUDY_UID, SERIES_UID, '1.2.3.4.1');

    const metadata = await reader.readJsonFile(instancePath, 'metadata');

    expect(sopUIDs(metadata)).toEqual(['1.2.3.4.1']);
  });

  it('rebuilds the series metadata from older-layout instances', async () => {
    writeOlderLayoutInstance('1.2.3.4.2', 2);
    writeOlderLayoutInstance('1.2.3.4.1', 1);
    // Populated series metadata, as left by the original import
    writeGzJson(path.join(seriesDir, 'metadata.gz'), [
      instanceJson('1.2.3.4.1', 1),
      instanceJson('1.2.3.4.2', 2),
    ]);

    await seriesSummary(baseDir, STUDY_UID, SERIES_UID);

    const seriesMetadata = readGzJson(path.join(seriesDir, 'metadata.gz'));
    expect(sopUIDs(seriesMetadata)).toEqual(['1.2.3.4.1', '1.2.3.4.2']);
    expect(seriesMetadata[0]['7FE00010'].BulkDataURI).toBe('./instances/1.2.3.4.1/frames');
    expect(sopUIDs(readGzJson(path.join(seriesDir, 'instances', 'index.json.gz')))).toEqual([
      '1.2.3.4.1',
      '1.2.3.4.2',
    ]);
    // The original per-instance metadata stays in place
    expect(
      fs.existsSync(path.join(seriesDir, 'instances', '1.2.3.4.1', 'metadata', 'index.json.gz'))
    ).toBe(true);
    expect(processErrors).toEqual([]);
  });

  it('keeps the existing series metadata when no instance metadata can be read', async () => {
    fs.mkdirSync(path.join(seriesDir, 'instances', '1.2.3.4.1', 'frames'), { recursive: true });
    const existing = [instanceJson('1.2.3.4.1', 1)];
    writeGzJson(path.join(seriesDir, 'metadata.gz'), existing);

    await seriesSummary(baseDir, STUDY_UID, SERIES_UID);
    // Let any stream 'error' events or rejections from the skipped writes surface
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(readGzJson(path.join(seriesDir, 'metadata.gz'))).toEqual(existing);
    expect(processErrors).toEqual([]);
  });
});
