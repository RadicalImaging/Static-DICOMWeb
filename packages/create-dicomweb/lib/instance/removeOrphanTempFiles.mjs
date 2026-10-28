import fs from 'fs';
import path from 'path';
import { TEMP_FILE_NAME_RE } from './FileDicomWebWriter.mjs';

/** Default minimum age of a temp file that removeOrphanTempFiles removes (24 hours) */
export const DEFAULT_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Removes the temp files that a stopped process left in `studies/temp/` and
 * `studies/<studyUID>/temp/` (SQR-D19).
 *
 * A file is removed only when its name is a temp file name of FileDicomWebWriter
 * (TEMP_FILE_NAME_RE), and its last write (mtime) is older than maxAgeMs. A running upload
 * keeps the temp files of its instance until the commit of that instance, so maxAgeMs must be
 * longer than the upload of one instance; another process on the same storage is safe with the
 * same rule. The temp directories stay, because a writer can open a file in them at any time.
 *
 * Asynchronous and sequential, so a large store does not block the event loop. Never throws:
 * logs each error, and continues.
 *
 * @param {string} dicomdir - DICOMweb root directory
 * @param {Object} [options]
 * @param {number} [options.maxAgeMs=DEFAULT_TEMP_MAX_AGE_MS]
 * @param {number} [options.now=Date.now()]
 * @returns {Promise<number>} - The number of removed files
 */
export async function removeOrphanTempFiles(dicomdir, options = {}) {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_TEMP_MAX_AGE_MS;
  const oldest = (options.now ?? Date.now()) - maxAgeMs;
  const studiesDir = path.join(dicomdir, 'studies');
  let removed = 0;

  const listDir = async dir => {
    try {
      return await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err?.code !== 'ENOENT' && err?.code !== 'ENOTDIR') {
        console.warn(`[removeOrphanTempFiles] Could not list ${dir}:`, err?.message || err);
      }
      return [];
    }
  };

  const studies = await listDir(studiesDir);
  const tempDirs = studies
    .filter(entry => entry.isDirectory())
    .map(entry =>
      entry.name === 'temp'
        ? path.join(studiesDir, 'temp')
        : path.join(studiesDir, entry.name, 'temp')
    );

  for (const tempDir of tempDirs) {
    for (const entry of await listDir(tempDir)) {
      if (!entry.isFile() || !TEMP_FILE_NAME_RE.test(entry.name)) continue;
      const file = path.join(tempDir, entry.name);
      try {
        if ((await fs.promises.stat(file)).mtimeMs < oldest) {
          await fs.promises.unlink(file);
          removed += 1;
        }
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          console.warn(`[removeOrphanTempFiles] Could not remove ${file}:`, err?.message || err);
        }
      }
    }
  }
  if (removed > 0) {
    console.noQuiet(`[removeOrphanTempFiles] Removed ${removed} temp file(s) in ${studiesDir}`);
  }
  return removed;
}
