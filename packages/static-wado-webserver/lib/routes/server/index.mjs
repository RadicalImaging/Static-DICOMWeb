import setStudiesRoutes from "./studies.mjs";

/**
 * Set all app server routes.
 *
 * @param {*} routerExpress root entry point for studies routes (router express).
 * @param {*} params
 * @param {*} dir static files directory path
 */
export default function setRoutes(routerExpress, params, dir) {
  setStudiesRoutes(routerExpress, params, dir);
}
