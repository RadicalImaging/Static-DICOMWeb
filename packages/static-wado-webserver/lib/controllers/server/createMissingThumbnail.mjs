import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import fs from 'fs';
import { mkdicomwebSpawn } from '../../services/util/serverSpawn.mjs';

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
    let execPath = ['thumbnail', studyUID];
    if (instanceUID) {
      execPath.push('--sop-instance-uid', instanceUID);
    } else if (seriesUID) {
      execPath.push('--series-instance-uid', seriesUID, '--series-thumbnail');
    } else {
      execPath.push('--study-thumbnail');
    }

    if (options?.hashStudyUidPath) {
      execPath.push('--hash-study-uid-path');
    }

    try {
      await mkdicomwebSpawn(execPath, { parseResults: false });
      console.verbose('Created missing thumbnail');
    } catch (e) {
      // Ignore e
      console.warn('Caught', e);
    }
    next();
  };
}
