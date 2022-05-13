import setQueryProxy from "./queryProxy.mjs";
import setRejectProxy from "./rejectProxy.mjs";

/**
 * Setup server plugin routes.  Plugin routes are defined by the config-point
 * definition, and can load code appropriately for the plugin.
 *
 * @param {*} routerExpress root entry point for studies routes (router express).
 * @param {*} params
 */
export default async function setProxy(routerExpress, params) {
  // TODO - make these load from plugins - as such, they need standard parameters.
  // setQueryProxy does load from a plugin, but it should be fully defined there, including the
  // registration parameters.

  await setQueryProxy(routerExpress, "/studies", params, "studyQuery");
  setRejectProxy(routerExpress, params);
}
