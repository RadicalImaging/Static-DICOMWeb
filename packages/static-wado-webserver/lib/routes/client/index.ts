import setViewerRoutes from "./viewer";

/**
 * Set all app client routes.
 *
 * @param {*} routerExpress root entry point for studies routes (router express).
 * @param {*} params
 * @param {*} dir static files directory path
 */
export default function setRoutes(routerExpress, params, dir) {
  setViewerRoutes(routerExpress, params, dir);
}
