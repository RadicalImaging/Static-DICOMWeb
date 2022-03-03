import { assertions } from "@ohif/static-wado-util";
import { qidoMap, otherJsonMap } from "../../adapters/requestAdapters.mjs";
import { defaultPostController as postController } from "../../controllers/server/commonControllers.mjs";
import { defaultNotFoundController as notFoundController } from "../../controllers/server/notFoundControllers.mjs";
import { defaultGetProxyController } from "../../controllers/server/proxyControllers.mjs";
import { defaultGetStaticController as staticController } from "../../controllers/server/staticControllers.mjs";

/**
 * Set studies (/studies) routes.
 *
 * @param {*} routerExpress root entry point for studies routes.
 * @param {*} params
 * @param {*} dir static files directory path
 */
export default function setRoutes(routerExpress, params, dir) {
  // adapt requests
  routerExpress.get(["/studies", "/studies/:studyUID/series", "/studies/:studyUID/series/:seriesUID/instances"], qidoMap);
  routerExpress.get("/studies/:studyUID/series/metadata", otherJsonMap);

  routerExpress.post(["/studies", "/studies/:studyUID/series", "/studies/:studyUID/series/:seriesUID/instances"], postController(params));
  // Handle the QIDO queries
  routerExpress.use(staticController(dir));

  // fallback route to external SCP
  if (assertions.assertAeDefinition(params, "proxyAe") && !!params.staticWadoAe) {
    routerExpress.get("/studies/:studyUID/series/*.*", defaultGetProxyController(params, { studyInstanceUIDPattern: "studyUID" }, true));
  }

  routerExpress.use("/studies/:studyUID/", notFoundController);
}
