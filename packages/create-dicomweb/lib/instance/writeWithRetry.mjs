import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

const MAX_RETRIES = 3;

/**
 * Writes data to a DICOMweb file with compareOnClose enabled, retrying if the
 * file was modified by another writer during the write.
 *
 * On each attempt the order is critical:
 * 1. Opens the stream (captures mtime of any existing file at that moment).
 * 2. Calls `generateData()` to read source data from disk — this happens AFTER
 *    the mtime snapshot so we can detect if someone changed the output file
 *    while we were reading inputs.
 * 3. Writes the generated data to the temp file and closes.
 * 4. On close, compares temp with existing file:
 *    - 'identical'    → files match, temp deleted, done.
 *    - 'updated-stale'→ someone else changed the file since we opened;
 *      our inputs may be stale, so retry from step 1.
 *    - 'created'/'updated' → success, done.
 *
 * @param {Object} params
 * @param {Object} params.informationProvider - UID provider for the writer
 * @param {string} params.baseDir - Base directory for DICOMweb
 * @param {Function} params.openStream - (writer) => streamInfo  — opens the appropriate level stream
 * @param {Function} params.generateData - async () => Buffer|string|null — produces the data to write.
 *   Called AFTER openStream so mtime is already captured. Return null to abort (temp is cleaned up).
 * @param {string} params.label - Human-readable label for log messages
 * @returns {Promise<{writeStatus: string, path: string|undefined}>}
 */
export async function writeWithRetry({ informationProvider, baseDir, openStream, generateData, label }) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // 1. Open the stream first — this snapshots the mtime of the existing file
    const writer = new FileDicomWebWriter(informationProvider, { baseDir });
    const streamInfo = await openStream(writer);

    // 2. Now read source data (after mtime is captured)
    const data = await generateData();
    if (data === null) {
      // Nothing to write — abort the stream and clean up
      writer.recordStreamError(streamInfo.streamKey, new Error('No data to write'), true);
      return { writeStatus: 'skipped', path: undefined };
    }

    // 3. Write and close
    streamInfo.write(Buffer.isBuffer(data) ? data : Buffer.from(data));
    const resultPath = await writer.closeStream(streamInfo.streamKey);

    // 4. Only 'updated-stale' triggers a retry; everything else is clean
    const status = streamInfo.writeStatus;
    if (status !== 'updated-stale') {
      return { writeStatus: status, path: resultPath };
    }

    if (attempt < MAX_RETRIES) {
      console.warn(
        `[writeWithRetry] ${label}: file was modified by another writer (attempt ${attempt}/${MAX_RETRIES}), retrying...`
      );
      continue;
    }
    console.warn(
      `[writeWithRetry] ${label}: file was modified by another writer, giving up after ${MAX_RETRIES} attempts`
    );
    return { writeStatus: status, path: resultPath };
  }
}
