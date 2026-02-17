import setStudiesRoutes from './studies.mjs';
import { statusController } from '../../controllers/server/statusController.mjs';

/**
 * Middleware to handle Kheops-style JWT link routes.
 * Strips the /link/{JWT}/ prefix and forwards to regular routes.
 * Example: /link/eyJhbGci.../studies/1.2.3/... → /studies/1.2.3/...
 *
 * Note: This middleware does NOT validate the JWT - it simply strips the prefix
 * to allow the request to be handled by the regular DICOMweb routes.
 * For production use with real authentication, you should add JWT validation.
 */
function linkRouteMiddleware(req, res, next) {
  // Match /link/{jwt}/... pattern
  const linkMatch = req.path.match(/^\/link\/([^/]+)(\/.*)?$/);
  if (linkMatch) {
    // const jwt = linkMatch[1]; // JWT token (not validated here)
    const remainingPath = linkMatch[2] || '/';

    // Rewrite the URL to strip the /link/{jwt} prefix
    req.url = remainingPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  }
  next();
}

/**
 * Set all app server routes.
 *
 * @param {*} routerExpress root entry point for studies routes (router express).
 * @param {*} params
 * @param {*} dir static files directory path
 * @param {*} hashStudyUidPath change studies folder structure to path and subpath before studyUID
 */
export default function setRoutes(routerExpress, params, dir, hashStudyUidPath) {
  // Handle Kheops-style /link/{JWT}/ routes by stripping the prefix
  routerExpress.use(linkRouteMiddleware);

  setStudiesRoutes(routerExpress, params, dir, hashStudyUidPath);
  routerExpress.get('/status', statusController);
  setStudiesRoutes(routerExpress, params, dir, hashStudyUidPath);
}
