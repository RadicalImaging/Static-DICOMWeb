import { assertions } from "@radicalimaging/static-wado-util";
import { qidoMap, otherJsonMap, thumbnailMap, multipartMap } from "../../adapters/requestAdapters";
import { defaultPostController as postController } from "../../controllers/server/commonControllers";
import { defaultNotFoundController as notFoundController } from "../../controllers/server/notFoundControllers";
import { defaultGetProxyController } from "../../controllers/server/proxyControllers";
import { indexingStaticController, nonIndexingStaticController } from "../../controllers/server/staticControllers";

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
    "/studies/:studyUID/series/:seriesUID/instances/:instanceUID/frames/:frames",
    multipartMap
  );
  
  routerExpress.get(["/studies", "/studies/:studyUID/series", "/studies/:studyUID/series/:seriesUID/instances"], qidoMap);
  routerExpress.get("/studies/:studyUID/series/metadata", otherJsonMap);

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
