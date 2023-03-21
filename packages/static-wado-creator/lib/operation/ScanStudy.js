const path = require("path");

function ScanStudy(options) {
  const { directoryName, deduplicatedRoot, deduplicatedInstancesRoot } = options;

  return function scanStudy(studyInstanceUid) {
    console.log("scanStudy", studyInstanceUid);
    const studyPath = path.join(directoryName, "studies", studyInstanceUid);
    const deduplicatedInstancesPath = path.join(deduplicatedInstancesRoot, studyInstanceUid);
    const deduplicatedPath = path.join(deduplicatedRoot, studyInstanceUid);
    console.log("Importing", studyInstanceUid, studyPath, deduplicatedInstancesPath, deduplicatedPath);
    return this.completeStudy.getCurrentStudyData(this, {
      studyPath,
      deduplicatedPath,
      deduplicatedInstancesPath,
      studyInstanceUid,
    });
  };
}

module.exports = ScanStudy;
