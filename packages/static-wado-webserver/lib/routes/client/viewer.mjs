import { htmlMap } from "../../adapters/requestAdapters.mjs";
import { defaultGetStaticController as staticController } from "../../controllers/client/staticControllers.mjs";

export default function setViewerRoutes(routerExpress, params, dir) {
  routerExpress.get(["/viewer", "/viewer/*", "/findings", "/healthlake", "/microscopy", "/datasources", "/volume"], htmlMap);
  // routerExpress.get(/\/[a-zA-Z0-9_]+$/, htmlMap);
  routerExpress.use(staticController(dir));
}
