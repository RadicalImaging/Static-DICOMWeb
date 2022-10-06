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

/**
 * Handles returning multipart/related DICOM
 */
export const dicomMap = (req, res, next) => {
  res.setHeader("content-type", "multipart/related");
  req.url = `${req.path}/index.mht.gz`;
  next();
};

/**
 * Handles returning thumbnail jpeg
 */
export const multipartMap = (req, res, next) => {
  res.setHeader("content-type", "multipart/related");
  next();
};

/** Handles returning index multipart maps - used to return raw binary data in a directory, eg .../frames */
export const multipartIndexMap = (req, res, next) => {
  res.setHeader("content-type", "multipart/related");
  req.url = `${req.path}/index.mht.gz`;
  next();
};

export const htmlMap = (req, res, next) => {
  req.url = "/index.html";
  next();
};
