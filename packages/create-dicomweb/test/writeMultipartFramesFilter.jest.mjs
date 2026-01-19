import fs from 'fs';
import path from 'path';
import { instanceFromStream } from '../lib/instance/instanceFromStream.mjs';

describe('writeMultipartFramesFilter', () => {
  test('should parse jpeg8bit.dcm and write 96 frames', async () => {
    // Get the test directory - use process.cwd() as base since tests run from package root
    // The test file is in packages/create-dicomweb/tests/
    const packageRoot = process.cwd().endsWith('create-dicomweb')
      ? process.cwd()
      : path.resolve(process.cwd(), 'packages/create-dicomweb');
    const testDir = path.join(packageRoot, 'tests');

    // Path to the test DICOM file - user specified: ../../packages/static-wado-creator/dicom/jpeg8bit.dcm
    // This is relative to the package root (packages/create-dicomweb/), not the test directory
    const dicomFilePath = path.resolve(
      packageRoot,
      '../../packages/static-wado-creator/dicom/jpeg8bit.dcm'
    );

    // Create a temporary directory for output
    const tempDir = path.join(packageRoot, 'tmp/test-frames');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Read the DICOM file as a stream
    const stream = fs.createReadStream(dicomFilePath);

    // Process the DICOM file with the filter
    const result = await instanceFromStream(stream, { dicomdir: tempDir });
    console.log('instanceFromStream result:', {
      hasWriter: !!result.writer,
      hasMeta: !!result.meta,
      hasDict: !!result.dict,
      dictKeys: result.dict ? Object.keys(result.dict).length : 0,
      information: result.information,
      studyUID: result.dict?.['0020000D']?.Value?.[0]
    });

    // Helper function to find the frames directory
    const findFramesDir = baseDir => {
      const studiesDir = path.join(baseDir, 'studies');
      if (!fs.existsSync(studiesDir)) return null;

      const studies = fs.readdirSync(studiesDir);
      if (studies.length === 0) return null;

      const studyDir = path.join(studiesDir, studies[0]);
      const seriesDir = path.join(studyDir, 'series');
      if (!fs.existsSync(seriesDir)) return null;

      const series = fs.readdirSync(seriesDir);
      if (series.length === 0) return null;

      const instanceDir = path.join(seriesDir, series[0], 'instances');
      if (!fs.existsSync(instanceDir)) return null;

      const instances = fs.readdirSync(instanceDir);
      if (instances.length === 0) return null;

      const framesDir = path.join(instanceDir, instances[0], 'frames');
      return fs.existsSync(framesDir) ? framesDir : null;
    };

    // Check for frames directory immediately after instanceFromStream completes
    const framesDir = findFramesDir(tempDir);

    expect(framesDir).not.toBeNull();
    expect(fs.existsSync(framesDir)).toBe(true);

    // Check for exactly 96 frames immediately
    const frameFiles = fs
      .readdirSync(framesDir)
      .filter(file => file.endsWith('.mht') || file.endsWith('.mht.gz'));

    // Assert that we have exactly 96 frames
    expect(frameFiles.length).toBe(96);
    
    // Assert that the PixelData tag has BulkDataURI instead of Value array
    const pixelDataTag = result.dict['7FE00010'];
    expect(pixelDataTag).toBeDefined();
    expect(pixelDataTag.BulkDataURI).toBe('./frames');
    expect(pixelDataTag.Value).toBeUndefined();
    
    console.log("PixelData tag:", JSON.stringify(result.dict, null, 2));
  }, 30000); // 30 second timeout for file operations
});
