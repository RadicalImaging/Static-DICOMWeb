/**
 * Maps QIDO queries for studies, series and instances to the index.json.gz file.
 */
export const qidoMap = (req, res, next) => {
  req.url = `${req.path}/index.json.gz`;
  res.setHeader("content-type", "application/json");
  next();
};

/**
 * Handles returning other JSON files as application/json, and uses the compression extension.
 */
export const otherJsonMap = (req, res, next) => {
  res.setHeader("content-type", "application/json");
  req.url = `${req.path}.gz`;
  next();
};

/**
 * Handles returning thumbnail jpeg
 */
export const thumbnailMap = (req, res, next) => {
  res.setHeader("content-type", "image/jpeg");
  req.url = `${req.path}`;
  next();
};

export const htmlMap = (req, res, next) => {
  req.url = "/index.html";
  next();
};
