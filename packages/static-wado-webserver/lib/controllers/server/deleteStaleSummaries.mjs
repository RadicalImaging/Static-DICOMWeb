import path from 'path';
import { FileDicomWebReader, FileDicomWebWriter } from '@radicalimaging/create-dicomweb';

/**
 * Deletes series-level and study-level summary/index files for the given
 * studies and series so they can be regenerated (e.g. by updateSeries/updateStudy
 * or on-demand). Uses DicomWebReader for path construction and DicomWebWriter.delete
 * for removal (FileDicomWebWriter). Supports multiple study UIDs in a single call.
 *
 * Per series (for each studyUID + seriesUID):
 * - Series metadata: studies/{studyUID}/series/{seriesUID}/metadata[.gz]
 * - Single series information: studies/{studyUID}/series/{seriesUID}/series-singleton.json[.gz]
 *
 * Per study (once per studyUID):
 * - Study-level series index: studies/{studyUID}/series/index.json[.gz]
 * - Study-level information: studies/{studyUID}/index.json[.gz]
 *
 * @param {string} dicomdir - DICOMweb root directory (absolute or relative)
 * @param {Map<string, unknown>} seriesMap - Map of seriesId -> info, where seriesId is "studyUID&seriesUID"
 */
export function deleteStaleSummaries(dicomdir, seriesMap) {
  if (!dicomdir || !seriesMap || seriesMap.size === 0) {
    return;
  }

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

  // Delete per-series files for each (studyUID, seriesUID) using reader paths and writer.delete
  for (const [studyUID, seriesUIDSet] of seriesByStudy) {
    for (const seriesUID of seriesUIDSet) {
      const seriesRelativePath = reader.getSeriesPath(studyUID, seriesUID);
      writer.delete(seriesRelativePath, 'metadata');
      writer.delete(seriesRelativePath, 'series-singleton.json');
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
