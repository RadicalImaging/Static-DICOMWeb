import {
  assertions,
  getStudyUIDPathAndSubPath,
  createStudyDirectories,
} from '@radicalimaging/static-wado-util';
import {
  qidoMap,
  dicomMap,
  otherJsonMap,
  thumbnailMap,
  multipartIndexMap,
} from '../../adapters/requestAdapters.mjs';
import {
  streamPostController as postController,
  completePostController,
} from '../../controllers/server/streamPostController.mjs';
import { studyQueryController } from '../../controllers/server/indexOnDemandController.mjs';
import { seriesQueryController } from '../../controllers/server/seriesQueryController.mjs';
import { seriesMetadataQueryController } from '../../controllers/server/seriesMetadataQueryController.mjs';
import { defaultNotFoundController as notFoundController } from '../../controllers/server/notFoundControllers.mjs';
import { defaultGetProxyController } from '../../controllers/server/proxyControllers.mjs';
import {
  indexingStaticController,
  nonIndexingStaticController,
} from '../../controllers/server/staticControllers.mjs';
import byteRangeRequest from '../../controllers/server/byteRangeRequest.mjs';
import renderedMap from '../../controllers/server/renderedMap.mjs';
import createMissingThumbnail from '../../controllers/server/createMissingThumbnail.mjs';
import part10Controller from '../../controllers/server/part10Controller.mjs';

/**
 * Set studies (/studies) routes.
 *
 * @param {*} routerExpress root entry point for studies routes.
 * @param {*} params
 * @param {*} dir static files directory path
 * @param {*} hashStudyUidPath change studies folder structure to path and subpath before studyUID
 */
export default function setRoutes(routerExpress, params, dir, hashStudyUidPath) {
  createStudyDirectories(dir);

  // Add hang endpoint for testing if --hang flag is enabled
  if (params.hang) {
    console.log('Hang endpoint enabled at /dicomweb/hang');
    routerExpress.get('/hang', (req, res) => {
      const timeInSeconds = parseInt(req.query.time || '240', 10);
      console.log(`[Hang] Starting hang for ${timeInSeconds} seconds...`);

      const startTime = Date.now();
      let currentTime = Date.now();

      // Tight loop that keeps checking the time
      while ((currentTime - startTime) / 1000 < timeInSeconds) {
        currentTime = Date.now();
      }

      const elapsedSeconds = ((currentTime - startTime) / 1000).toFixed(2);
      console.log(`[Hang] Completed hang after ${elapsedSeconds} seconds`);

      res.send({
        message: 'Hang completed',
        requestedSeconds: timeInSeconds,
        actualSeconds: parseFloat(elapsedSeconds),
      });
    });
  }

  routerExpress.use('/', (req, res, next) => {
    req.staticWadoPath = req.path;

    if (hashStudyUidPath) {
      const studyUID = req.staticWadoPath.match(/\/studies\/([^/]+)/)?.[1]; // get UID only
      if (studyUID) {
        const { path: hashPath = '', subpath: hashSubpath = '' } =
          getStudyUIDPathAndSubPath(studyUID);
        const hashPrefix = `${hashPath}/${hashSubpath}`;
        const newPath = req.staticWadoPath.replace(
          `/studies/${studyUID}`,
          `/studies/${hashPrefix}/${studyUID}`
        );

        req.staticWadoPath = newPath;
      }
    }
    next();
  });

  // Study and Series query have custom endpoints to retrieve single-UID response
  routerExpress.get('/studies', studyQueryController(dir, { ...params, hashStudyUidPath }));
  routerExpress.get('/studies/:studyUID/series', seriesQueryController(dir, params));

  routerExpress.get(
    [
      '/studies/:studyUID/series/:seriesUID/thumbnail',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/thumbnail',
    ],
    createMissingThumbnail(params)
  );
  routerExpress.get(
    [
      '/studies/:studyUID/thumbnail',
      '/studies/:studyUID/series/:seriesUID/thumbnail',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/thumbnail',
    ],
    thumbnailMap
  );
  routerExpress.get(
    [
      '/studies/:studyUID/rendered',
      '/studies/:studyUID/series/:seriesUID/rendered',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/rendered',
    ],
    renderedMap(params)
  );

  // Gets the frame metadata - adds support for byte range requests and single part
  routerExpress.get(
    [
      '/:ae/studies/:studyUID/series/:seriesUID/instances/:instanceUID/frames/:frames',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/frames/:frames',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/lossy/:frames',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/htj2k/:frames',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/htj2kThumbnail/:frames',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/jls/:frames',
      '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/jlsThumbnail/:frames',
    ],
    byteRangeRequest(params)
  );
  routerExpress.get(
    '/studies/:studyUID/series/:seriesUID/instances/:instanceUID/frames',
    multipartIndexMap
  );

  routerExpress.get(['/studies/:studyUID/series/:seriesUID/instances'], qidoMap);

  // Part 10 controller: handles accept negotiation for application/dicom,
  // application/zip, and multipart/related; type="application/dicom".
  // Falls through to dicomMap if no Part 10 accept type is requested.
  routerExpress.get(
    '/studies/:studyUID/series/:seriesUID/instances/:instanceUID',
    part10Controller(params)
  );

  routerExpress.get('/studies/:studyUID/series/:seriesUID/instances/:sopUID', dicomMap);
  routerExpress.get(
    '/studies/:studyUID/series/:seriesUID/metadata',
    seriesMetadataQueryController(dir, params)
  );
  routerExpress.get(
    [
      '/studies/:studyUID/series/metadata',
      '/studies/:studyUID/metadataTree.json',
      '/:ae/studies/:studyUID/metadataTree.json',
    ],
    otherJsonMap
  );

  routerExpress.post(
    ['/studies', '/studies/:studyUID/series', '/studies/:studyUID/series/:seriesUID/instances'],
    postController(params, hashStudyUidPath),
    completePostController
  );
  // Handle the QIDO queries
  routerExpress.use(indexingStaticController(dir));
  // serve static file content (non indexing) (thumbnail mostly)
  routerExpress.use(nonIndexingStaticController(dir));

  // fallback route to external SCP
  if (assertions.assertAeDefinition(params, 'proxyAe') && !!params.staticWadoAe) {
    console.log('Proxying studies from', params.proxyAe, 'to', params.staticWadoAe);
    routerExpress.get(
      '/studies/:studyUID/series/{*path}',
      defaultGetProxyController(params, { studyInstanceUIDPattern: 'studyUID' }, true)
    );
  }

  routerExpress.use('/studies/:studyUID/', notFoundController);
}
