const path = require("path");
const {
  getStudyUIDPathAndSubPath,
} = require("@radicalimaging/static-wado-util");

function IdCreator({
  directoryName,
  deduplicatedRoot,
  deduplicatedInstancesRoot,
  hashStudyUidPath,
}) {
  return (uids, filename) => {
    const { studyInstanceUid, seriesInstanceUid, sopInstanceUid } = uids;

    const { path: hashPath = "", subpath: hashSubpath = "" } = hashStudyUidPath
      ? getStudyUIDPathAndSubPath(studyInstanceUid)
      : {};

    console.warn("hashStudyUidPath=", hashStudyUidPath);
    const studySubDir = hashStudyUidPath
      ? path.join(hashPath, hashSubpath, studyInstanceUid)
      : studyInstanceUid;

    const studyPath = path.join(directoryName, "studies", studySubDir);
    const seriesRootPath = path.join(studyPath, "series", seriesInstanceUid);
    const sopInstanceRootPath = path.join(
      seriesRootPath,
      "instances",
      sopInstanceUid
    );
    const imageFrameRootPath = path.join(sopInstanceRootPath, "frames");

    const deduplicatedPath = path.join(deduplicatedRoot, studySubDir);
    const deduplicatedInstancesPath = path.join(
      deduplicatedInstancesRoot,
      studySubDir
    );

    return {
      ...uids,
      studyPath,
      deduplicatedPath,
      deduplicatedInstancesPath,
      seriesRootPath,
      sopInstanceRootPath,
      imageFrameRootPath,
      filename,
    };
  };
}

module.exports = IdCreator;
