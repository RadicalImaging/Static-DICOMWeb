import fs from 'fs';
import path from 'path';
import { seriesSummary } from '../instance/SeriesSummary.mjs';
import { FileDicomWebReader } from '../instance/FileDicomWebReader.mjs';

/**
 * Main function for processing series metadata
 * @param {string} studyUID - Study Instance UID
 * @param {Object} options - Options object
 * @param {string} [options.dicomdir] - Base directory path where DICOMweb structure is located
 * @param {string} [options.seriesUid] - Specific Series Instance UID to process (if not provided, processes all series in the study)
 */
export async function seriesMain(studyUID, options = {}) {
  const { dicomdir, seriesUid } = options;
  
  if (!dicomdir) {
    throw new Error('dicomdir option is required');
  }
  
  const reader = new FileDicomWebReader(dicomdir);
  
  let seriesUIDs = [];
  
  if (seriesUid) {
    // Process specific series
    seriesUIDs = [seriesUid];
  } else {
    // Scan for all series in the study
    const seriesPath = reader.getStudyPath(studyUID, 'series');
    const seriesDirectories = await reader.scanDirectory(seriesPath, { withFileTypes: true });
    
    for (const entry of seriesDirectories) {
      // If withFileTypes is used, entry is a Dirent object
      if (entry && typeof entry === 'object' && entry.isDirectory && entry.isDirectory()) {
        seriesUIDs.push(entry.name);
      } else if (typeof entry === 'string') {
        // Fallback: if entry is a string, check if it's a directory
        const seriesDirPath = `${seriesPath}/${entry}`;
        const fullSeriesPath = path.join(reader.baseDir, seriesDirPath);
        
        try {
          const stats = fs.lstatSync(fullSeriesPath);
          if (stats.isDirectory()) {
            seriesUIDs.push(entry);
          }
        } catch (error) {
          // Skip if we can't stat the path
          console.warn(`Could not stat ${seriesDirPath}: ${error.message}`);
        }
      }
    }
  }
  
  if (seriesUIDs.length === 0) {
    console.warn(`No series found for study ${studyUID}`);
    return;
  }
  
  // Process each series
  for (const seriesUID of seriesUIDs) {
    try {
      console.log(`Processing series ${seriesUID}...`);
      await seriesSummary(dicomdir, studyUID, seriesUID);
      console.log(`Completed series ${seriesUID}`);
    } catch (error) {
      console.error(`Error processing series ${seriesUID}: ${error.message}`);
      throw error;
    }
  }
}
