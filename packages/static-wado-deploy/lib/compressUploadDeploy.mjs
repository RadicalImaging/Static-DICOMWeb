import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { createGzip } from 'zlib';
import path from 'path';
import { pipeline } from 'stream/promises';

import DeployGroup from './DeployGroup.mjs';
import uploadDeploy from './uploadDeploy.mjs';

// File types that benefit from maximum compression
const HIGH_COMPRESSION_TYPES = ['.json', '.js', '.css', '.html', '.txt', '.xml'];

/**
 * Determines optimal compression level based on file type
 * @param {string} filePath File path
 * @returns {number} Compression level (1-9)
 */
function getCompressionLevel(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return HIGH_COMPRESSION_TYPES.includes(ext) ? 9 : 6;
}

/**
 * Compresses a single file using streaming
 * @param {string} inputPath Source file path
 * @param {string} outputPath Destination file path
 * @param {number} level Compression level
 */
async function compressFile(inputPath, outputPath, level) {
  const gzip = createGzip({ level });
  await pipeline(createReadStream(inputPath), gzip, createWriteStream(outputPath));
}

/**
 * Recursively finds all files in a directory
 * @param {string} dir Directory path
 * @returns {Promise<string[]>} Array of file paths
 */
async function findFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

export default async function compressUploadDeploy(directory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  const baseDir = deployer.baseDir;

  try {
    console.log('Starting compression for', name, 'directory', baseDir);

    // Find all files
    const files = await findFiles(baseDir);
    const total = files.length;
    let processed = 0;

    // Process files in parallel batches
    const batchSize = 5; // Process 5 files at a time
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, Math.min(i + batchSize, files.length));
      const compressionTasks = batch.map(async file => {
        const level = getCompressionLevel(file);
        const gzipPath = `${file}.gz`;

        try {
          await compressFile(file, gzipPath, level);
          processed++;
          if (processed % 10 === 0 || processed === total) {
            console.log(
              `Compression progress: ${Math.round((processed / total) * 100)}% (${processed}/${total})`
            );
          }
        } catch (err) {
          console.warn(`Failed to compress ${file}:`, err);
          return false;
        }
        return true;
      });

      await Promise.all(compressionTasks);
    }

    console.log('Uploading compressed files...');
    await uploadDeploy(directory, config, name, options, deployPlugin);

    // Clean up compressed files
    console.log('Cleaning up compressed files...');
    await Promise.all(
      files.map(file =>
        fs.unlink(`${file}.gz`).catch(err => {
          console.warn(`Failed to clean up ${file}.gz:`, err);
        })
      )
    );
  } catch (error) {
    console.error('Compression failed:', error);
    throw error;
  }
}
