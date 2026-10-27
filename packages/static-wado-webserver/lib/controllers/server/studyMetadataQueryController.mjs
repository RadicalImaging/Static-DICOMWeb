import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import {
  handleHomeRelative,
  isMissingPathError,
  toStorageError,
} from '@radicalimaging/static-wado-util';
import { createBuildReader } from '@radicalimaging/create-dicomweb';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import {
  ensureSeriesLevel,
  seriesNeedsBuild,
  seriesMetadataOf,
  handleBuildError,
} from './indexOnDemandController.mjs';

const gunzip = promisify(zlib.gunzip);

async function readSeriesMetadata(seriesDirectory) {
  const gzipPath = path.join(seriesDirectory, 'metadata.gz');

  try {
    const compressed = await fs.readFile(gzipPath);
    return JSON.parse((await gunzip(compressed)).toString('utf8'));
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  return JSON.parse(await fs.readFile(path.join(seriesDirectory, 'metadata'), 'utf8'));
}

/**
 * Serves standard WADO-RS study metadata by combining the generated metadata
 * arrays for every series in the study. When a series needs a build (seriesNeedsBuild),
 * builds those series in one job of the build job manager (each series as a nested job), and
 * uses the data of the first round for a series whose build did not commit. With builds on
 * demand, a series that stores no metadata (no readable data) adds no instances. When the
 * build queue is full, or the storage cannot be read, answers 503 with Retry-After.
 *
 * @param {string} dir Static DICOMweb root directory.
 * @param {object} params Server parameters.
 * @returns {function} Express middleware.
 */
export function studyMetadataQueryController(dir, params = {}) {
  return async function studyMetadataQueryControllerHandler(req, res, next) {
    const root = handleHomeRelative(dir ?? params.rootDir);
    const studyUID = req.params.studyUID;
    const studyPath = req.staticWadoPath.replace(/\/metadata\/?$/, '').replace(/^\/+/, '');
    const seriesRoot = path.join(root, studyPath, 'series');
    const createOnDemand = params.createIndexOnDemand !== false;

    try {
      const seriesUIDs = (
        await fs.readdir(seriesRoot, { withFileTypes: true }).catch(error => {
          throw toStorageError(seriesRoot, error);
        })
      )
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));

      let built;
      if (createOnDemand) {
        const reader = createBuildReader(root);
        const needsBuild = async () => {
          for (const seriesUID of seriesUIDs) {
            if (await seriesNeedsBuild(reader, studyUID, seriesUID)) {
              return true;
            }
          }
          return false;
        };
        if (await needsBuild()) {
          const result = await getBuildJobManager(params).run(
            `study-metadata:${studyUID}`,
            needsBuild,
            async context => {
              const payload = new Map();
              for (const seriesUID of seriesUIDs) {
                const seriesResult = await ensureSeriesLevel(root, studyUID, seriesUID, {
                  reader,
                  context,
                });
                payload.set(seriesUID, seriesMetadataOf(seriesResult));
              }
              // Each series job starts its own next round, so this job does not
              return { committed: true, payload };
            }
          );
          built = result?.payload;
        }
      }

      const metadataBySeries = await Promise.all(
        seriesUIDs.map(async seriesUID => {
          const seriesDirectory = path.join(seriesRoot, seriesUID);
          try {
            return await readSeriesMetadata(seriesDirectory);
          } catch (error) {
            if (createOnDemand && isMissingPathError(error)) {
              return built?.get(seriesUID) ?? [];
            }
            throw toStorageError(seriesDirectory, error);
          }
        })
      );

      const metadata = metadataBySeries.flat();
      if (!metadata.length) {
        return res.status(404).json([]);
      }

      return res.type('application/dicom+json').send(metadata);
    } catch (error) {
      if (isMissingPathError(error)) {
        return res.status(404).json([]);
      }
      return handleBuildError(
        error,
        res,
        next,
        'studyMetadataQuery: failed to build series metadata'
      );
    }
  };
}
