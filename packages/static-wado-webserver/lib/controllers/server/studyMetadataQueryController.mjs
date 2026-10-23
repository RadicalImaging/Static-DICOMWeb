import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { getBuildJobManager } from '../../util/buildJobManager.mjs';
import {
  ensureSeriesLevel,
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
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  return JSON.parse(await fs.readFile(path.join(seriesDirectory, 'metadata'), 'utf8'));
}

const hasSeriesMetadata = seriesDirectory =>
  existsSync(path.join(seriesDirectory, 'metadata.gz')) ||
  existsSync(path.join(seriesDirectory, 'metadata'));

/**
 * Serves standard WADO-RS study metadata by combining the generated metadata
 * arrays for every series in the study. When the metadata of a series is missing, builds
 * those series in one job of the build job manager (each series as a nested job), and uses
 * the data of the first round for a series whose build did not commit. When the build
 * queue is full, answers 503 with Retry-After.
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
      const seriesEntries = (await fs.readdir(seriesRoot, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name));
      const missing = () =>
        seriesEntries.filter(entry => !hasSeriesMetadata(path.join(seriesRoot, entry.name)));

      let built;
      if (createOnDemand && missing().length) {
        const result = await getBuildJobManager(params).run(
          `study-metadata:${studyUID}`,
          () => missing().length > 0,
          async context => {
            const payload = new Map();
            for (const entry of missing()) {
              const seriesResult = await ensureSeriesLevel(root, studyUID, entry.name, {
                context,
              });
              payload.set(entry.name, seriesMetadataOf(seriesResult));
            }
            // Each series job starts its own next round, so this job does not
            return { committed: true, payload };
          }
        );
        built = result?.payload;
      }

      const metadataBySeries = await Promise.all(
        seriesEntries.map(async entry => {
          try {
            return await readSeriesMetadata(path.join(seriesRoot, entry.name));
          } catch (error) {
            const fallback = built?.get(entry.name);
            if (error?.code === 'ENOENT' && fallback?.length) {
              return fallback;
            }
            throw error;
          }
        })
      );

      const metadata = metadataBySeries.flat();
      if (!metadata.length) {
        return res.status(404).json([]);
      }

      return res.type('application/dicom+json').send(metadata);
    } catch (error) {
      if (error?.code === 'ENOENT') {
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
