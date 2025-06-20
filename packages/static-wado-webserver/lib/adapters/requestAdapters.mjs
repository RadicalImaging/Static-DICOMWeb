const extensions = {
  "image/jphc": ".jhc",
  "image/jpeg": ".jpeg",
};

/**
 * Maps QIDO queries for studies, series and instances to the index.json.gz file.
 */
export const qidoMap = (req, res, next) => {
  req.url = `${req.staticWadoPath}/index.json.gz`;
  res.setHeader("content-type", "application/json; charset=utf-8");
  next();
};

export const getDicomKey = (codeKey, lowerKey, query) => {
  for (const [key, value] of Object.entries(query)) {
    const keyToLower = key.toLowerCase();
    if (keyToLower === codeKey || keyToLower === lowerKey) {
      return value;
    }
  }
};

/** 
 * Handles direct map for single studies - normally handled by a proxy controller,
 * but in the case there isn't one, this will handle it.
 */
export const studySingleMap = (req, res, next) => {
  const studyUID = getDicomKey("0020000d", "studyinstanceuid", req.query);
  if (studyUID) {
    req.url = `${req.staticWadoPath}/index.json.gz`;
    res.setHeader("content-type", "application/json; charset=utf-8");
    next();
    return;
  }
  return qidoMap(req, res, next);
};

export const seriesSingleMap = (req, res, next) => {
  const seriesUID = getDicomKey("0020000e", "seriesinstanceuid", req.query);
  if (seriesUID) {
    req.url = `${req.staticWadoPath}/${seriesUID}/series-singleton.json.gz`;
    res.setHeader("content-type", "application/json; charset=utf-8");
    next();
    return;
  }
  return qidoMap(req, res, next);
};

/**
 * Handles returning other JSON files as application/json, and uses the compression extension.
 */
export const otherJsonMap = (req, res, next) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  req.url = `${req.staticWadoPath}.gz`;
  next();
};

/**
 * Handles returning thumbnail jpeg
 */
export const thumbnailMap = (req, res, next) => {
  res.setHeader("content-type", "image/jpeg");
  req.url = `${req.staticWadoPath}`;
  next();
};

/**
 * Handles returning multipart/related DICOM
 */
export const dicomMap = (req, res, next) => {
  res.setHeader("content-type", "multipart/related");
  req.url = `${req.staticWadoPath}/index.mht.gz`;
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
    req.url = `${req.staticWadoPath}${extension}`;
  } else {
    res.setHeader("content-type", "multipart/related");
  }
  next();
};

/** Handles returning index multipart maps - used to return raw binary data in a directory, eg .../frames */
export const multipartIndexMap = (req, res, next) => {
  res.setHeader("content-type", "multipart/related");
  req.url = `${req.staticWadoPath}/index.mht.gz`;
  next();
};

export const htmlMap = (req, res, next) => {
  req.url = "/index.html";
  next();
};
