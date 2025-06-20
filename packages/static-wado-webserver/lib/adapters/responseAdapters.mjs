/** Adds the compression headers to the response */
// eslint-disable-next-line import/prefer-default-export
export const gzipHeaders = (res, path) => {
  if (path.indexOf(".gz") !== -1) {
    res.setHeader("Content-Encoding", "gzip");
    if (path.indexOf("bulkdata") !== -1) {
      res.setHeader("Content-Type", "multipart/related");
    }
  } else if (path.indexOf(".br") !== -1) {
    res.setHeader("Content-Encoding", "br");
  }
};
