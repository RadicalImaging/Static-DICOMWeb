import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { thumbnailMain } from '@radicalimaging/create-dicomweb';
import fs from 'fs';

export default function createMissingThumbnail(options) {
  const { dir } = options;
  const baseDir = handleHomeRelative(dir);

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

    try {
      // Each request is for a single thumbnail (instance/series/study). Use on-demand semantics
      // so thumbnailMain creates only the required thumbnail, not every thumbnail in the study.
      const thumbnailOptions = {
        dicomdir: baseDir,
        onDemandThumbnail: true,
      };

      if (instanceUID) {
        thumbnailOptions.instanceUid = instanceUID;
        if (seriesUID) {
          thumbnailOptions.seriesUid = seriesUID;
        }
      } else if (seriesUID) {
        thumbnailOptions.seriesUid = seriesUID;
      }
      // else: only studyUID provided -> study-level thumbnail (middle series, middle instance, middle frame).

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
