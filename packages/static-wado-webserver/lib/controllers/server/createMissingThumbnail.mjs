import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { thumbnailMain } from '@radicalimaging/create-dicomweb';
import fs from 'fs';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import {
  ensureSeriesLevel,
  ensureStudyLevel,
  handleBuildError,
} from './indexOnDemandController.mjs';

/**
 * Makes a missing instance or series thumbnail. An upload deletes the thumbnails, and also the
 * series and study files that thumbnailMain reads (SQR-D5). Thus, with builds on demand, this
 * first builds those files in the build job manager: the series level for an instance
 * thumbnail, and the study level for a series thumbnail. A build error gives 503 or 500
 * (handleBuildError), as for a query.
 * @param {Object} options - Server params (dir, createIndexOnDemand, studyIndex, and the job limits)
 */
export default function createMissingThumbnail(options) {
  const { dir } = options;
  const baseDir = handleHomeRelative(dir);
  const createOnDemand = options.createIndexOnDemand !== false;

  return async (req, res, next) => {
    const fullPath = `${baseDir}${req.staticWadoPath}`;
    if (fs.existsSync(fullPath)) {
      console.verbose('Path', fullPath, ' already exists, no need to create');
      next();
      return;
    }

    const { studyUID, seriesUID, instanceUID } = req.params;

    console.noQuiet(
      'Need to create thumbnail on path',
      fullPath,
      'for',
      studyUID,
      seriesUID,
      instanceUID
    );

    if (createOnDemand) {
      try {
        const jobOptions = { jobs: getBuildJobManager(options), studyIndex: options.studyIndex };
        if (instanceUID && seriesUID) {
          await ensureSeriesLevel(baseDir, studyUID, seriesUID, jobOptions);
        } else {
          await ensureStudyLevel(baseDir, studyUID, jobOptions);
        }
      } catch (err) {
        handleBuildError(err, res, next, 'thumbnail: failed to build the summary files');
        return;
      }
    }

    try {
      const thumbnailOptions = {
        dicomdir: baseDir,
      };

      if (instanceUID) {
        // Generate thumbnail for specific instance
        thumbnailOptions.instanceUid = instanceUID;
        if (seriesUID) {
          thumbnailOptions.seriesUid = seriesUID;
        }
      } else if (seriesUID) {
        // Generate series thumbnail (middle SOP instance, middle frame)
        thumbnailOptions.seriesUid = seriesUID;
        thumbnailOptions.seriesThumbnail = true;
      } else {
        // Only studyUID provided - use default behavior (first series, first instance)
        // Note: study-level thumbnails are not currently supported
        console.verbose('Only studyUID provided, using default behavior');
      }

      await thumbnailMain(studyUID, thumbnailOptions);
      console.verbose('Created missing thumbnail');
    } catch (e) {
      console.warn('Thumbnail generation failed:', e?.message || e);
      if (!res.headersSent) {
        res.status(404).json({ error: e?.message || 'Thumbnail not available' });
      }
      return;
    }
    next();
  };
}
