import fs from 'fs';
import path from 'path';
import { constants } from 'dcmjs';
import { instanceFromStream } from '../lib/instance/instanceFromStream.mjs';

const { TagHex } = constants;

describe('writeBulkdataFilter', () => {
  let packageRoot;
  let dicomFilePath;
  let tempDir;
  let result;
  let testDir;

  beforeAll(async () => {
    packageRoot = process.cwd().endsWith('create-dicomweb')
      ? process.cwd()
      : path.resolve(process.cwd(), 'packages/create-dicomweb');
    testDir = path.join(packageRoot, 'tests');

    // Path to the test DICOM file
    dicomFilePath = path.resolve(
      packageRoot,
      '../../packages/static-wado-creator/dicom/jpeg8bit.dcm'
    );

    // Create a temporary directory for output
    tempDir = path.join(packageRoot, 'tmp/test-bulkdata');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Read the DICOM file as a stream
    const stream = fs.createReadStream(dicomFilePath);

    // Process the DICOM file with bulkdata filter
    // Set low thresholds to capture PixelData as bulkdata
    result = await instanceFromStream(stream, {
      dicomdir: tempDir,
      bulkdata: true,
      sizeBulkdataTags: 1024, // 1KB threshold for public tags
      sizePrivateBulkdataTags: 64, // 1KB threshold for private tags
    });

    console.log('instanceFromStream result:', {
      hasWriter: !!result.writer,
      hasMeta: !!result.meta,
      hasDict: !!result.dict,
      dictKeys: result.dict ? Object.keys(result.dict).length : 0,
      information: result.information,
      studyUID: result.dict?.['0020000D']?.Value?.[0],
    });
    console.warn("result:\n", JSON.stringify(result.dict,null,2));
  }, 30_000);

  // Helper function to find the bulkdata directory
  const findBulkdataDir = baseDir => {
    const studiesDir = path.join(baseDir, 'studies');
    if (!fs.existsSync(studiesDir)) return null;

    const studies = fs.readdirSync(studiesDir);
    if (studies.length === 0) return null;

    const studyDir = path.join(studiesDir, studies[0]);
    const bulkdataDir = path.join(studyDir, 'bulkdata');
    return fs.existsSync(bulkdataDir) ? bulkdataDir : null;
  };

  test('should write bulkdata for large tags', async () => {
    // Check for bulkdata directory
    const bulkdataDir = findBulkdataDir(tempDir);

    expect(bulkdataDir).not.toBeNull();
    expect(fs.existsSync(bulkdataDir)).toBe(true);

    // Count bulkdata files (recursively)
    const countMhtFiles = dir => {
      let count = 0;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          count += countMhtFiles(fullPath);
        } else if (item.endsWith('.mht') || item.endsWith('.mht.gz')) {
          count++;
        }
      }
      return count;
    };

    const bulkdataFileCount = countMhtFiles(bulkdataDir);

    // Expect at least one bulkdata file (other large tags besides PixelData)
    expect(bulkdataFileCount).toBeGreaterThan(0);
  });

   test('should write frames bulkdata', async () => {
    const { studyInstanceUid: studyUid, seriesInstanceUid: seriesUid, sopInstanceUid: sopUid, numberOfFrames } = result.information;
    const frameBase = `studies/${studyUid}/series/${seriesUid}/instances/${sopUid}/frames`;
    expect(fs.existsSync(path.join(tempDir,frameBase))).toBe(true);
    for(let i=1; i<=numberOfFrames; i++) {
      expect(fs.existsSync(path.join(tempDir, frameBase, `${i}.mht`)));
    }
  }); 

  test('should assign frame uri', () => {
    const pixelData = result.dict['7FE00010'];
    expect(pixelData).not.toBeUndefined();
    expect(pixelData.BulkDataURI).toBe('./frames');
  });

  test('should assign bulkdata for tag 50003000', () => {
    const { studyInstanceUid: studyUid, seriesInstanceUid: seriesUid, sopInstanceUid: sopUid, numberOfFrames } = result.information;
    const bulkdata = result.dict['50003000'];
    expect(bulkdata).not.toBeUndefined();
    expect(bulkdata.BulkDataURI).toBe('../../../../bulkdata/ec/61/2cb6a152c80ca5de04faf017d4ac2b52c44308b14d5f98e6ca5915d8ec16.mht.gz');
    const imageBase = `studies/${studyUid}/series/${seriesUid}/instances/${sopUid}`;
    expect(fs.existsSync(path.join(tempDir, imageBase, bulkdata.BulkDataURI))).toBe(true);
  });

  test('should not write short bulkdata', () => {
    const studyTag = result.dict['0020000D'];
    expect(studyTag).not.toBeUndefined();
    expect(studyTag.BulkDataURI).toBeUndefined();
  })
});
