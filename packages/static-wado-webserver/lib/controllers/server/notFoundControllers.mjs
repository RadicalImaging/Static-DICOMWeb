/* eslint-disable import/prefer-default-export */
/**
 * Default handling when a request isn't found.  Just responds with a 404 and a message saying it wasn't found.
 */
export function defaultNotFoundController(req, res, next) {
  console.log("Not found", req.params.studyUID, req.path);
  res
    .status(404)
    .send(
      `Couldn't find ${req.staticWadoPath} in studyUID ${req.params.studyUID} - TODO, query remote with params=${JSON.stringify(req.params)} and query=${JSON.stringify(
        req.query
      )}`
    );
  next();
}
