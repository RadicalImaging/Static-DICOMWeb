/* eslint-disable import/prefer-default-export */
/**
 * Default handling when a request isn't found.  Just responsds with a 404 and a message saying it wasn't found.
 */
export function defaultNotFoundController(req, res, next) {
  console.log("Not found", req.path);
  res
    .status(404)
    .send(
      `Couldn't find ${req.path} in studyUID ${req.params.studyUID} - TODO, query remote with params=${JSON.stringify(req.params)} and query=${JSON.stringify(
        req.query
      )}`
    );
  next();
}
