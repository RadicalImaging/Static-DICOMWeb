import { handleHomeRelative } from "@ohif/static-wado-util";
import express from "express";
import setServerRoutes from "./server/index.mjs";
import setClientRoutes from "./client/index.mjs";
import setProxy from "./proxy/index.mjs";
import setPluginRoutes from "./plugins/index.mjs";

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

  // Adds the plugin routes, proxy routes and then server default routes
  await setPluginRoutes(routerServer, params.rootGroup, "plugins");
  await setProxy(routerServer, params, serverDir);
  setServerRoutes(routerServer, params, serverDir);

  // set client routes, first plugin, then the default routes
  await setPluginRoutes(clientServer, params.clientGroup, "plugins");
  setClientRoutes(clientServer, params, clientDir);
}
