import { handleHomeRelative } from "@ohif/static-wado-util";
import express from "express";
import setServerRoutes from "./server/index.mjs";
import setClientRoutes from "./client/index.mjs";
import setProxy from "./proxy/index.mjs";

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

  if (!serverRootDir || !clientRootDir) {
    console.log("Missing static files source directory");
    return;
  }

  const serverDir = handleHomeRelative(serverRootDir);
  const clientDir = handleHomeRelative(clientRootDir);

  const routerServer = express.Router();
  const clientServer = express.Router();

  // set routers
  appExpress.use(serverPath, routerServer);
  appExpress.use(clientPath, clientServer);

  // defines proxy list which will deviate from this server handling.
  await setProxy(routerServer, params, serverDir);
  // set routes
  setClientRoutes(clientServer, params, clientDir);
  setServerRoutes(routerServer, params, serverDir);
}
