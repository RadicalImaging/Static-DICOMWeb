import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';
import { seriesMain } from '@radicalimaging/create-dicomweb';

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

/**
 * Serves standard WADO-RS study metadata by combining the generated metadata
 * arrays for every series in the study.
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

      const metadataBySeries = await Promise.all(
        seriesEntries.map(async entry => {
          const seriesDirectory = path.join(seriesRoot, entry.name);

          try {
            return await readSeriesMetadata(seriesDirectory);
          } catch (error) {
            if (!createOnDemand || error?.code !== 'ENOENT') {
              throw error;
            }
            await seriesMain(studyUID, { dicomdir: root, seriesUid: entry.name });
            return readSeriesMetadata(seriesDirectory);
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
      return next(error);
    }
  };
}
