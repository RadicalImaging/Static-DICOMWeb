import fs from 'fs';
import os from 'os';
import path from 'path';
import dcmjsDimse from 'dcmjs-dimse';
import { generatePart10ForInstance, FileDicomWebReader } from '@radicalimaging/create-dicomweb';
import { Tags, handleHomeRelative } from '@radicalimaging/static-wado-util';

const { CStoreRequest } = dcmjsDimse.requests;
const { Status } = dcmjsDimse.constants;
const { getValue } = Tags;

/** PS3.4 C.4.2.1.4 / C.4.3.1.4 status values that dcmjs-dimse does not name. */
export const RetrieveStatus = {
  SubOperationsCompleteWithFailures: 0xb000,
  UnableToPerformSubOperations: 0xa702,
  MoveDestinationUnknown: 0xa801,
};

// Text VRs where a backslash is part of the value, not a value separator
const SINGLE_VALUE_TEXT = new Set(['LT', 'ST', 'UT', 'UR']);

/**
 * Adapts series metadata that the static-wado-creator importer wrote to the
 * form that generatePart10ForInstance reads. That importer writes a
 * BulkDataURI `bulkdata/...` relative to the study directory, and a
 * multi-valued string as one backslash-joined value.
 */
export function adaptLegacyMetadata(dataset) {
  for (const value of Object.values(dataset)) {
    if (!value || typeof value !== 'object') continue;
    if (value.BulkDataURI?.startsWith('bulkdata/')) {
      value.BulkDataURI = `../../${value.BulkDataURI}`;
    }
    const values = value.Value;
    if (!Array.isArray(values)) continue;
    if (value.vr === 'SQ') {
      values.forEach(adaptLegacyMetadata);
    } else if (
      !SINGLE_VALUE_TEXT.has(value.vr) &&
      values.length === 1 &&
      typeof values[0] === 'string' &&
      values[0].includes('\\')
    ) {
      value.Value = values[0].split('\\');
    }
  }
  return dataset;
}

/**
 * Writes each instance that the retrieve identifier matches to a temporary
 * Part 10 file. A caller sends the files as C-STORE sub-operations, and
 * dcmjs-dimse reads each file only when it sends that file.
 *
 * @param {string} rootDir - Static DICOMweb root directory.
 * @param {Object} identifier - Naturalized C-GET or C-MOVE identifier.
 * @returns {Promise<{dir: string, files: string[]}>} The temporary directory
 *   (the caller removes it) and the Part 10 files.
 * @throws {Error} When the identifier has no StudyInstanceUID.
 */
export async function writeRetrieveFiles(rootDir, identifier) {
  const { StudyInstanceUID: study, SeriesInstanceUID: series, SOPInstanceUID: sop } = identifier;
  if (!study) {
    throw new Error('the retrieve identifier has no StudyInstanceUID');
  }
  const dicomdir = handleHomeRelative(rootDir);
  const reader = new FileDicomWebReader(dicomdir);
  const seriesIndex =
    (await reader.readJsonFile(reader.getStudyPath(study, { path: 'series' }), 'index.json')) || [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scp-retrieve-'));
  const files = [];
  try {
    for (const seriesItem of seriesIndex) {
      const seriesUid = getValue(seriesItem, Tags.SeriesInstanceUID);
      if (series && seriesUid !== series) continue;
      const metadata =
        (await reader.readJsonFile(reader.getSeriesPath(study, seriesUid), 'metadata')) || [];
      const seriesDir = path.join(dicomdir, 'studies', study, 'series', seriesUid);
      for (const instance of metadata) {
        const sopUid = getValue(instance, Tags.SOPInstanceUID);
        if (sop && sopUid !== sop) continue;
        const { buffer } = await generatePart10ForInstance(
          seriesDir,
          adaptLegacyMetadata(instance)
        );
        const file = path.join(dir, `${sopUid}.dcm`);
        fs.writeFileSync(file, buffer);
        files.push(file);
      }
    }
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return { dir, files };
}

/**
 * Sends one C-STORE sub-operation for each file, and reports the counts
 * after each sub-operation.
 *
 * @param {string[]} files - Part 10 files.
 * @param {function(CStoreRequest[]): void} send - Queues the requests on an association.
 * @param {function(Object): void} onProgress - Gets { remaining, completed, failed }.
 * @returns {Promise<{remaining: number, completed: number, failed: number}>}
 *   Resolves when every sub-operation is done.
 */
export function sendSubOperations(files, send, onProgress) {
  const counts = { remaining: files.length, completed: 0, failed: 0 };
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
        else counts.failed++;
        onProgress({ ...counts });
        if (counts.remaining === 0) resolve(counts);
      });
      return request;
    });
    send(requests);
  });
}

/** Gives the final C-GET or C-MOVE status for the sub-operation counts. */
export function finalRetrieveStatus({ completed, failed }) {
  if (!failed) return Status.Success;
  return completed
    ? RetrieveStatus.SubOperationsCompleteWithFailures
    : RetrieveStatus.UnableToPerformSubOperations;
}
