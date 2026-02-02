import { handleHomeRelative, logger } from '@radicalimaging/static-wado-util';
import { thumbnailMain } from '@radicalimaging/create-dicomweb';
import fs from 'fs';

const { webserverLog } = logger;

export default function createMissingThumbnail(options) {
  const { dir } = options;
  const baseDir = handleHomeRelative(dir);

  return async (req, res, next) => {
    const fullPath = `${baseDir}${req.staticWadoPath}`;
    if (fs.existsSync(fullPath)) {
      webserverLog.debug('Path', fullPath, ' already exists, no need to create');
      next();
      return;
    }

    const { studyUID, seriesUID, instanceUID } = req.params;

    webserverLog.info(
      'Need to create thumbnail on path',
      fullPath,
      'for',
      studyUID,
      seriesUID,
      instanceUID
    );

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
        webserverLog.debug('Only studyUID provided, using default behavior');
      }

      await thumbnailMain(studyUID, thumbnailOptions);
      webserverLog.debug('Created missing thumbnail');
    } catch (e) {
      // Ignore e
      webserverLog.warn('Caught', e);
    }
    next();
  };
}
