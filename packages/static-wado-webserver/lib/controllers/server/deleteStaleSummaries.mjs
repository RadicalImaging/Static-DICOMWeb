import path from 'path';
import {
  FileDicomWebReader,
  FileDicomWebWriter,
  generationTracker,
  seriesGenerationKey,
} from '@radicalimaging/create-dicomweb';

/**
 * Deletes the derived files that new data makes stale, so that the next build
 * (an updateSeries/updateStudy message, or a request) makes them again. The upload calls
 * it after each stored instance, and again after the upload stores all of its instances.
 * Supports multiple study UIDs in a single call.
 *
 * First changes the generation of each series and of each study, then deletes the files.
 * A build of a different series of the same study can thus still commit. All calls are
 * synchronous, with no `await` between the generation change and the deletions: a build
 * on this node thus cannot check the generation and move a stale file between the two steps.
 *
 * Per series (for each studyUID + seriesUID):
 * - Series metadata: studies/{studyUID}/series/{seriesUID}/metadata[.gz]
 * - Single series information: studies/{studyUID}/series/{seriesUID}/series-singleton.json[.gz]
 * - Instances index: studies/{studyUID}/series/{seriesUID}/instances/index.json[.gz]
 *
 * Per study (once per studyUID):
 * - Study-level series index: studies/{studyUID}/series/index.json[.gz]
 * - Study-level information: studies/{studyUID}/index.json[.gz]
 *
 * The studies list (studies/index.json) stays: it is a best-effort list, and the study
 * update adds a missing study to it.
 *
 * @param {string} dicomdir - DICOMweb root directory (absolute or relative)
 * @param {Map<string, unknown>} seriesMap - Map of seriesId -> info, where seriesId is "studyUID&seriesUID"
 * @param {Object} [options]
 * @param {Object} [options.generations] - Generation tracker (defaults to the shared tracker of create-dicomweb)
 */
export function deleteStaleSummaries(dicomdir, seriesMap, options = {}) {
  if (!dicomdir || !seriesMap || seriesMap.size === 0) {
    return;
  }
  const generations = options.generations ?? generationTracker;

  const baseDir = path.resolve(dicomdir);
  const reader = new FileDicomWebReader(baseDir);
  const writer = new FileDicomWebWriter({}, { baseDir });

  const studyUIDs = new Set();
  const seriesByStudy = new Map(); // studyUID -> Set of seriesUID

  for (const seriesId of seriesMap.keys()) {
    const parts = seriesId.split('&');
    const studyUID = parts[0];
    const seriesUID = parts[1];
    if (!studyUID || !seriesUID) continue;
    studyUIDs.add(studyUID);
    if (!seriesByStudy.has(studyUID)) {
      seriesByStudy.set(studyUID, new Set());
    }
    seriesByStudy.get(studyUID).add(seriesUID);
  }
  if (studyUIDs.size === 0) {
    return;
  }

  for (const [studyUID, seriesUIDSet] of seriesByStudy) {
    generations.advance(studyUID);
    for (const seriesUID of seriesUIDSet) {
      generations.advance(seriesGenerationKey(studyUID, seriesUID));
    }
  }

  // Delete per-series files for each (studyUID, seriesUID) using reader paths and writer.delete
  for (const [studyUID, seriesUIDSet] of seriesByStudy) {
    for (const seriesUID of seriesUIDSet) {
      const seriesRelativePath = reader.getSeriesPath(studyUID, seriesUID);
      writer.delete(seriesRelativePath, 'metadata');
      writer.delete(seriesRelativePath, 'series-singleton.json');
      writer.delete(seriesRelativePath, 'instances/index.json');
    }
  }

  // Delete study-level files for each studyUID (series index + study singleton)
  for (const studyUID of studyUIDs) {
    const seriesIndexRelativePath = reader.getStudyPath(studyUID, { path: 'series' });
    writer.delete(seriesIndexRelativePath, 'index.json');
    const studyRelativePath = reader.getStudyPath(studyUID);
    writer.delete(studyRelativePath, 'index.json');
  }
}
