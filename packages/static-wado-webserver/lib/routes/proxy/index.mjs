import setQueryProxy from "./queryProxy.mjs";

/**
 * Set all app client routes.
 *
 * @param {*} routerExpress root entry point for studies routes (router express).
 * @param {*} params
 */
export default async function setProxy(routerExpress, params) {
  await setQueryProxy(routerExpress, "/studies", params, "studyQuery");
}
