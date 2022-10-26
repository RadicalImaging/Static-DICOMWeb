import { htmlMap } from "../../adapters/requestAdapters.mjs";
import { defaultGetStaticController as staticController } from "../../controllers/client/staticControllers.mjs";

export default function setViewerRoutes(routerExpress, params, dir) {
  routerExpress.get(["/viewer", "/viewer/*", "/findings", "/curie", "/volume"], htmlMap);
  routerExpress.use(staticController(dir));
}
