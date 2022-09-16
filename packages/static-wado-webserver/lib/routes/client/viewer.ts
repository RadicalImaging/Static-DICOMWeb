import { htmlMap } from "../../adapters/requestAdapters";
import { defaultGetStaticController as staticController } from "../../controllers/client/staticControllers";

export default function setViewerRoutes(routerExpress, params, dir) {
  routerExpress.get(["/viewer", "/viewer/*"], htmlMap);
  routerExpress.use(staticController(dir));
}
