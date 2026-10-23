import fs from 'fs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

const MAX_RETRIES = 3;

/** Write statuses of a file that the writer moved to its final name */
const MOVED_STATUSES = new Set(['created', 'updated', 'updated-stale']);

/**
 * Creates the generation check of one build round. Reads the generation now, so call it
 * before the build reads any data. Without `generation`, returns undefined (no check).
 *
 * @param {Object} [generation]
 * @param {{current: Function}} generation.tracker - Generation tracker
 * @param {string} generation.studyUID - Study of the files
 * @param {number} [generation.value] - Generation that the build read when it started. When the
 *   build reads data before this write (for example nested builds of the series of a study),
 *   pass the value that it read first. Defaults to the current generation.
 * @returns {(() => boolean)|undefined} - Returns true while the generation did not change
 */
function createGenerationCheck(generation) {
  if (!generation?.tracker) {
    return undefined;
  }
  const { tracker, studyUID } = generation;
  const expected = generation.value ?? tracker.current(studyUID);
  return () => tracker.current(studyUID) === expected;
}

/**
 * Deletes the files that a round moved, after the generation changed (step 3 of the commit).
 * On one node the writer check finds each change first, so this step finds no change
 * there. The step is necessary when the generations are in shared storage.
 * @param {string[]} filepaths - Absolute paths of the moved files
 */
function deleteMovedFiles(filepaths) {
  for (const filepath of filepaths) {
    try {
      fs.rmSync(filepath, { force: true });
    } catch (err) {
      console.warn(`[writeWithRetry] Could not delete ${filepath}:`, err?.message || err);
    }
  }
}

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
 * This function will return { writeStatus: 'retries-exhausted', path: resultPath } if the file was modified by another writer after the maximum number of retries.
 * This isn't necessarily a failure, it just means that the file was modified by another writer after the maximum number of retries.
 * Presumably the other writer will eventually write the file, and we'll pick up the new version.
 *
 * If the function returns normally, even with retries=1, then it means the file
 * exists and is readable.  That can be used for immediate access queries.
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
export async function writeWithRetry({
  informationProvider,
  baseDir,
  openStream,
  generateData,
  label,
  retries = MAX_RETRIES,
}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
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
  return { writeStatus: 'retries-exhausted', path: resultPath };
}

/**
 * Writes multiple DICOMweb files in one retry loop, using a single shared payload.
 * Opens all streams first (capturing mtimes), calls generatePayload() once, then
 * writes and closes each stream. If any file gets 'updated-stale', the whole
 * batch is retried (generatePayload is called again). Use when payload generation
 * (e.g. readSeriesData) is expensive and all outputs depend on the same inputs.
 *
 * With `generation`, the files commit only when the generation did not change:
 * 1. Reads the generation before generatePayload() (or uses `generation.value`).
 * 2. The writer checks the generation immediately before each rename. When it changed,
 *    the writer deletes the temp file and sets writeStatus to 'generation-changed'.
 * 3. After all moves, reads the generation again. When it changed, deletes each moved file.
 * In both cases of a change, returns `committed: false` and does not retry: the caller
 * starts the next round. The retry loop for 'updated-stale' stays as it was.
 *
 * @param {Object} params
 * @param {Object} params.informationProvider - UID provider for the writer
 * @param {string} params.baseDir - Base directory for DICOMweb
 * @param {Function} params.generatePayload - async () => payload — called once per attempt after all streams are open
 * @param {Array<{openStream: (writer) => Promise<Object>, getData: (payload) => string|Buffer|null, label: string}>} params.writes
 * @param {{tracker: Object, studyUID: string|null, value?: number}} [params.generation] - Generation tracker and study UID
 * @param {number} [params.retries]
 * @returns {Promise<{writeStatus: string, committed: boolean, payload: *}>} - payload of the last attempt
 */
export async function writeMultipleWithRetry({
  informationProvider,
  baseDir,
  generatePayload,
  writes,
  generation,
  retries = MAX_RETRIES,
}) {
  const label = writes.map(w => w.label).join(', ');
  const isCurrent = createGenerationCheck(generation);
  let payload;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const writer = new FileDicomWebWriter(informationProvider, { baseDir, canCommit: isCurrent });
    const streamInfos = [];
    for (const w of writes) {
      const streamInfo = await w.openStream(writer);
      streamInfos.push({ ...w, streamInfo });
    }

    payload = await generatePayload();

    let anyStale = false;
    let generationChanged = false;
    const moved = [];
    for (const { streamInfo, getData } of streamInfos) {
      const data = getData(payload);
      if (data === null) {
        writer.recordStreamError(streamInfo.streamKey, new Error('No data to write'), true);
        await writer.closeStream(streamInfo.streamKey);
        continue;
      }
      streamInfo.write(Buffer.isBuffer(data) ? data : Buffer.from(data));
      await writer.closeStream(streamInfo.streamKey);
      const status = streamInfo.writeStatus;
      if (status === 'updated-stale') {
        anyStale = true;
      } else if (status === 'generation-changed') {
        generationChanged = true;
      }
      if (MOVED_STATUSES.has(status)) {
        moved.push(streamInfo.filepath);
      }
    }

    if (generationChanged || (isCurrent && !isCurrent())) {
      deleteMovedFiles(moved);
      console.verbose(`[writeMultipleWithRetry] ${label}: the generation changed, not committed`);
      return { writeStatus: 'generation-changed', committed: false, payload };
    }

    if (!anyStale) {
      return { writeStatus: 'ok', committed: true, payload };
    }

    if (attempt < retries) {
      console.warn(
        `[writeMultipleWithRetry] ${label}: one or more files were modified by another writer (attempt ${attempt}/${retries}), retrying...`
      );
      continue;
    }
    console.warn(
      `[writeMultipleWithRetry] ${label}: one or more files were modified by another writer, giving up after ${retries} attempts`
    );
    return { writeStatus: 'retries-exhausted', committed: true, payload };
  }
  return { writeStatus: 'retries-exhausted', committed: true, payload };
}
