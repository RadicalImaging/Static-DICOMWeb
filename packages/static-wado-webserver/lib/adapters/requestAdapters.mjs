const extensions = {
  "image/jphc": ".jhc",
  "image/jpeg": ".jpeg",
};

/**
 * Maps QIDO queries for studies, series and instances to the index.json.gz file.
 */
export const qidoMap = (req, res, next) => {
  req.url = `${req.path}/index.json.gz`;
  res.setHeader("content-type", "application/json; charset=utf-8");
  next();
};

/**
 * Handles returning other JSON files as application/json, and uses the compression extension.
 */
export const otherJsonMap = (req, res, next) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
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

export const frameIdMap = () =>
  // const { frameID, DatastoreID, DICOMStudyID } = req.query;
  // return frameID && DatastoreID && `/studies/htj2k/${DatastoreID}/${DICOMStudyID}/${frameID}.jhc`;
  null;

/**
 * Handles returning frames
 */
export const multipartMap = (req, res, next) => {
  const accept = req.header("accept") || "";
  const queryAccept = req.query.accept;
  const mappedFrame = frameIdMap(req);
  const extension = extensions[queryAccept || accept];
  if (mappedFrame) {
    res.setHeader("content-type", queryAccept || accept);
    req.url = mappedFrame;
  } else if (extension) {
    res.setHeader("content-type", queryAccept || accept);
    req.url = `${req.path}${extension}`;
  } else {
    res.setHeader("content-type", "multipart/related");
  }
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
