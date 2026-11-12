import fs from 'fs';
import os from 'os';
import path from 'path';
import dcmjsDimse from 'dcmjs-dimse';
import { generatePart10ForStudy } from '@radicalimaging/create-dicomweb';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';

const { CStoreRequest } = dcmjsDimse.requests;
const { Status } = dcmjsDimse.constants;

/** PS3.4 C.4.2.1.4 / C.4.3.1.4 status values that dcmjs-dimse does not name. */
export const RetrieveStatus = {
  SubOperationsCompleteWithFailures: 0xb000,
  UnableToPerformSubOperations: 0xa702,
  MoveDestinationUnknown: 0xa801,
  IdentifierDoesNotMatchSopClass: 0xa900,
};

// A DICOM UID (PS3.5 9.1); the UIDs also become path segments
const UID_PATTERN = /^(?=.{1,64}$)[0-9]+(\.[0-9]+)*$/;

// The unique keys that each retrieve level needs (PS3.4 C.4.2.2.1)
const LEVEL_KEYS = {
  STUDY: ['StudyInstanceUID'],
  SERIES: ['StudyInstanceUID', 'SeriesInstanceUID'],
  IMAGE: ['StudyInstanceUID', 'SeriesInstanceUID', 'SOPInstanceUID'],
};

/**
 * Checks a C-GET or C-MOVE identifier.
 *
 * @param {Object} identifier - Naturalized identifier.
 * @returns {string|undefined} The problem, or undefined for a valid identifier.
 */
export function identifierError(identifier) {
  const level = identifier.QueryRetrieveLevel || 'STUDY';
  const keys = LEVEL_KEYS[level];
  if (!keys) return `unsupported QueryRetrieveLevel ${level}`;
  for (const key of keys) {
    const values = [identifier[key]].flat();
    if (!values.length || !values.every(uid => UID_PATTERN.test(uid ?? ''))) {
      return `${key} is missing or not a valid UID at level ${level}`;
    }
    // Only the key of the retrieve level can hold a list (PS3.4 C.4.2.2.1)
    if (values.length > 1 && key !== keys.at(-1)) {
      return `${key} must have a single value at level ${level}`;
    }
  }
  return undefined;
}

/**
 * Writes each instance that the retrieve identifier matches to a temporary
 * Part 10 file. A caller sends the files as C-STORE sub-operations, and
 * dcmjs-dimse reads each file only when it sends that file. A study or
 * series that is not found gives no files.
 *
 * @param {string} rootDir - Static DICOMweb root directory.
 * @param {Object} identifier - Naturalized C-GET or C-MOVE identifier that
 *   identifierError accepts.
 * @returns {Promise<{dir: string, files: string[], failed: number}>} The
 *   temporary directory (the caller removes it), the Part 10 files, and the
 *   number of instances that could not be written.
 */
export async function writeRetrieveFiles(rootDir, identifier) {
  const { QueryRetrieveLevel: level = 'STUDY' } = identifier;
  const seriesUid = level === 'STUDY' ? undefined : identifier.SeriesInstanceUID;
  const sopUids = level === 'IMAGE' ? [identifier.SOPInstanceUID].flat() : undefined;
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scp-retrieve-'));
  const files = [];
  let failed = 0;
  // A STUDY-level retrieve can list several studies
  for (const study of [identifier.StudyInstanceUID].flat()) {
    try {
      await generatePart10ForStudy(handleHomeRelative(rootDir), study, {
        seriesUid,
        sopUids,
        onInstance: async ({ buffer }) => {
          const file = path.join(dir, `${files.length}.dcm`);
          files.push(file);
          await fs.promises.writeFile(file, buffer);
        },
        onError: (sopInstanceUID, e) => {
          console.warn('Retrieve cannot write', sopInstanceUID, e.message);
          failed++;
        },
      });
    } catch (e) {
      if (e.code !== 'NOT_FOUND') {
        await fs.promises.rm(dir, { recursive: true, force: true });
        throw e;
      }
    }
  }
  return { dir, files, failed };
}

/**
 * Removes the temporary retrieve directories that a stopped SCP left. Only
 * directories older than `maxAgeMs` go, because another SCP process can use
 * the same temporary directory.
 */
export function removeStaleRetrieveDirs(tmpDir = os.tmpdir(), maxAgeMs = 24 * 60 * 60 * 1000) {
  for (const name of fs.readdirSync(tmpDir)) {
    if (!name.startsWith('scp-retrieve-')) continue;
    const dir = path.join(tmpDir, name);
    try {
      if (Date.now() - fs.statSync(dir).mtimeMs > maxAgeMs) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('Cannot remove', dir, e.message);
    }
  }
}

/**
 * Sends one C-STORE sub-operation for each file, and reports the counts
 * after each sub-operation.
 *
 * @param {string[]} files - Part 10 files.
 * @param {function(CStoreRequest[]): void} send - Queues the requests on an association.
 * @param {function(Object): void} onProgress - Gets { remaining, completed, failed, warnings }.
 * @param {number} [failed=0] - Sub-operations that failed before the send.
 * @returns {Promise<{remaining: number, completed: number, failed: number, warnings: number}>}
 *   Resolves when every sub-operation is done. A request that gets no
 *   response (for example after an abort) must get raiseDoneEvent(). A
 *   warning status (0xBxxx) is a stored instance, counted in `warnings`.
 */
export function sendSubOperations(files, send, onProgress, failed = 0) {
  const counts = { remaining: files.length, completed: 0, failed, warnings: 0 };
  if (!files.length) return Promise.resolve(counts);
  return new Promise(resolve => {
    const requests = files.map(file => {
      const request = new CStoreRequest(file);
      let status;
      request.on('response', response => {
        status = response.getStatus();
      });
      let done = false;
      // dcmjs-dimse raises 'done' also when a request fails before a response
      request.on('done', () => {
        if (done) return;
        done = true;
        counts.remaining--;
        if (status === Status.Success) counts.completed++;
        else if ((status & 0xf000) === 0xb000) counts.warnings++;
        else counts.failed++;
        onProgress({ ...counts });
        if (counts.remaining === 0) resolve(counts);
      });
      return request;
    });
    send(requests);
  });
}

/**
 * Gives the final C-GET or C-MOVE status for the sub-operation counts:
 * Success with no failures or warnings, 0xB000 with
 * failures or warnings and at least one stored instance, otherwise 0xA702.
 */
export function finalRetrieveStatus({ completed, failed, warnings = 0 }) {
  if (!failed && !warnings) return Status.Success;
  return completed || warnings
    ? RetrieveStatus.SubOperationsCompleteWithFailures
    : RetrieveStatus.UnableToPerformSubOperations;
}
