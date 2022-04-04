const path = require("path");

function IdCreator({ directoryName, deduplicatedRoot, deduplicatedInstancesRoot }) {
  return (uids, filename) => {
    const studyPath = path.join(directoryName, "studies", uids.studyInstanceUid);
    const seriesRootPath = path.join(studyPath, "series", uids.seriesInstanceUid);
    const sopInstanceRootPath = path.join(studyPath, "series", uids.seriesInstanceUid, "instances", uids.sopInstanceUid);
    const deduplicatedPath = path.join(deduplicatedRoot, uids.studyInstanceUid);
    const deduplicatedInstancesPath = path.join(deduplicatedInstancesRoot, uids.studyInstanceUid);
    const imageFrameRootPath = path.join(sopInstanceRootPath, "frames");

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
