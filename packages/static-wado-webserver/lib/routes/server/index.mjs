import setStudiesRoutes from './studies.mjs';

/**
 * Set all app server routes.
 *
 * @param {*} routerExpress root entry point for studies routes (router express).
 * @param {*} params
 * @param {*} dir static files directory path
 * @param {*} hashStudyUidPath change studies folder structure to path and subpath before studyUID
 */
export default function setRoutes(routerExpress, params, dir, hashStudyUidPath) {
  setStudiesRoutes(routerExpress, params, dir, hashStudyUidPath);
}
