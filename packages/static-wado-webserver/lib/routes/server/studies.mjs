import { assertions } from "@radicalimaging/static-wado-util";
import { qidoMap, dicomMap, otherJsonMap, thumbnailMap, multipartIndexMap } from "../../adapters/requestAdapters.mjs";
import { defaultPostController as postController } from "../../controllers/server/commonControllers.mjs";
import { defaultNotFoundController as notFoundController } from "../../controllers/server/notFoundControllers.mjs";
import { defaultGetProxyController } from "../../controllers/server/proxyControllers.mjs";
import { indexingStaticController, nonIndexingStaticController } from "../../controllers/server/staticControllers.mjs";
import byteRangeRequest from "../../controllers/server/byteRangeRequest.mjs";
import renderedMap from "../../controllers/server/renderedMap.mjs";

/**
 * Set studies (/studies) routes.
 *
 * @param {*} routerExpress root entry point for studies routes.
 * @param {*} params
 * @param {*} dir static files directory path
 */
export default function setRoutes(routerExpress, params, dir) {
  // adapt requests
  routerExpress.get(
    ["/studies/:studyUID/thumbnail", "/studies/:studyUID/series/:seriesUID/thumbnail", "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/thumbnail"],
    thumbnailMap
  );
  routerExpress.get(
    ["/studies/:studyUID/rendered", "/studies/:studyUID/series/:seriesUID/rendered", "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/rendered"],
    renderedMap(params)
  );

  // Gets the frame metadata - adds support for byte range requests and single part
  routerExpress.get(
    [
      "/:ae/studies/:studyUID/series/:seriesUID/instances/:instanceUID/frames/:frames",
      "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/frames/:frames",
      "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/lossy/:frames",
      "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/htj2k/:frames",
      "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/htj2kThumbnail/:frames",
      "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/jls/:frames",
      "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/jlsThumbnail/:frames",
    ],
    byteRangeRequest(params)
  );
  routerExpress.get("/studies/:studyUID/series/:seriesUID/instances/:instanceUID/frames", multipartIndexMap);

  routerExpress.get(["/:ae/studies", "/studies", "/studies/:studyUID/series", "/studies/:studyUID/series/:seriesUID/instances"], qidoMap);
  routerExpress.get("/studies/:studyUID/series/:seriesUID/instances/:sopUID", dicomMap);
  routerExpress.get(["/studies/:studyUID/series/metadata", "/studies/:studyUID/metadataTree.json", "/:ae/studies/:studyUID/metadataTree.json"], otherJsonMap);

  routerExpress.post(["/studies", "/studies/:studyUID/series", "/studies/:studyUID/series/:seriesUID/instances"], postController(params));
  // Handle the QIDO queries
  routerExpress.use(indexingStaticController(dir));
  // serve static file content (non indexing) (thumbnail mostly)
  routerExpress.use(nonIndexingStaticController(dir));

  // fallback route to external SCP
  if (assertions.assertAeDefinition(params, "proxyAe") && !!params.staticWadoAe) {
    console.log("Proxying studies from", params.proxyAe, "to", params.staticWadoAe);
    routerExpress.get("/studies/:studyUID/series/*.*", defaultGetProxyController(params, { studyInstanceUIDPattern: "studyUID" }, true));
  }

  routerExpress.use("/studies/:studyUID/", notFoundController);
}
