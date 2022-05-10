import { handleHomeRelative } from "@ohif/static-wado-util";
import express from "express";
import setServerRoutes from "./server/index.mjs";
import setClientRoutes from "./client/index.mjs";
import setProxy from "./proxy/index.mjs";
import setAiIntegration from "./ai/index.mjs";

/**
 * Set all app routes.
 *
 * @param {*} appExpress root entry point for studies routes (router express).
 * @param {*} params
 */
export default async function setRoutes(appExpress, params) {
  const { rootDir: serverRootDir, clientDir: clientRootDir, path } = params;

  const serverPath = path || "/dicomweb";
  const clientPath = path || "/";
  const aiPath = path || "/ai";

  if (!serverRootDir || !clientRootDir) {
    console.log("Missing static files source directory");
    return;
  }

  const serverDir = handleHomeRelative(serverRootDir);
  const clientDir = handleHomeRelative(clientRootDir);

  const routerServer = express.Router();
  const clientServer = express.Router();
  const aiServer = express.Router();

  // set routers
  appExpress.use(serverPath, routerServer);
  appExpress.use(clientPath, clientServer);
  appExpress.use(aiPath, aiServer);

  // defines proxy list which will deviate from this server handling.
  await setProxy(routerServer, params, serverDir);

  // defines aiIntegration plugin handler routes.
  await setAiIntegration(aiServer, params, serverDir);
  // set routes
  setClientRoutes(clientServer, params, clientDir);
  setServerRoutes(routerServer, params, serverDir);
}
