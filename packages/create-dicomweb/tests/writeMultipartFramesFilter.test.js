import { test, expect, describe } from 'jest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { instanceFromStream } from '../lib/instance/instanceFromStream.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('writeMultipartFramesFilter', () => {
  test('should parse jpeg8bit.dcm and write 96 frames', async () => {
    // Path to the test DICOM file - user specified: ../../packages/static-wado-creator/dicom/jpeg8bit.dcm
    // This is relative to the package root (packages/create-dicomweb/), not the test directory
    const packageRoot = path.resolve(__dirname, '..');
    const dicomFilePath = path.resolve(packageRoot, '../../packages/static-wado-creator/dicom/jpeg8bit.dcm');
    
    // Create a temporary directory for output
    const tempDir = path.join(__dirname, '../tmp/test-frames');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Read the DICOM file as a stream
    const stream = fs.createReadStream(dicomFilePath);
    
    // Process the DICOM file with the filter
    await instanceFromStream(stream, { dicomdir: tempDir });

    // Helper function to find the frames directory
    const findFramesDir = (baseDir) => {
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

    // Poll for frames directory and files to be written (async writes)
    const maxWaitTime = 10000; // 10 seconds
    const pollInterval = 100; // 100ms
    const startTime = Date.now();
    let framesDir = null;
    
    while (!framesDir && (Date.now() - startTime) < maxWaitTime) {
      framesDir = findFramesDir(tempDir);
      if (!framesDir) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    expect(framesDir).not.toBeNull();
    expect(fs.existsSync(framesDir)).toBe(true);

    // Poll for exactly 96 frames to be written
    let frameFiles = [];
    while (frameFiles.length < 96 && (Date.now() - startTime) < maxWaitTime) {
      frameFiles = fs.readdirSync(framesDir).filter(file => 
        file.endsWith('.mht') || file.endsWith('.mht.gz')
      );
      if (frameFiles.length < 96) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    // Assert that we have exactly 96 frames
    expect(frameFiles.length).toBe(96);
  }, 30000); // 30 second timeout for file operations
});