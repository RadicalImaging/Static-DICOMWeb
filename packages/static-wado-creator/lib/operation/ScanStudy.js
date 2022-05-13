const path = require("path");

function ScanStudy(options) {
  const { directoryName, deduplicatedRoot, deduplicatedInstancesRoot } = options;

  return function run(dir, studyInstanceUid) {
    const studyPath = path.join(directoryName, "studies", studyInstanceUid);
    const deduplicatedPath = path.join(deduplicatedRoot, studyInstanceUid);
    const deduplicatedInstancesPath = path.join(deduplicatedInstancesRoot, studyInstanceUid);
    console.log("Scanning", dir, studyInstanceUid);
    return this.completeStudy.getCurrentStudyData(this, {
      studyPath,
      deduplicatedPath,
      deduplicatedInstancesPath,
      studyInstanceUid,
    });
  };
}

module.exports = ScanStudy;
