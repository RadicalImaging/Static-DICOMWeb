const { getStudyUIDPathAndSubPath } = require('@radicalimaging/static-wado-util');

const path = require('path');

function ScanStudy(options) {
  const { directoryName, deduplicatedRoot, deduplicatedInstancesRoot, hashStudyUidPath } = options;

  return function scanStudy(studyInstanceUid) {
    const { path: hashPath = '', subpath: hashSubpath = '' } = hashStudyUidPath
      ? getStudyUIDPathAndSubPath(studyInstanceUid)
      : {};

    console.verbose('scanStudy', studyInstanceUid);

    if (hashPath && hashSubpath) {
      console.verbose('hashPath', hashPath);
      console.verbose('hashSubpath', hashSubpath);
    }

    const studySubDir = hashStudyUidPath
      ? path.join(hashPath, hashSubpath, studyInstanceUid)
      : studyInstanceUid;

    const studyPath = path.join(directoryName, 'studies', studySubDir);
    const deduplicatedInstancesPath = path.join(
      deduplicatedInstancesRoot,
      // studyInstanceUid,
      studySubDir
    );
    const deduplicatedPath = path.join(deduplicatedRoot, studySubDir);
    console.verbose(
      'Importing',
      studyInstanceUid,
      studyPath,
      deduplicatedInstancesPath,
      deduplicatedPath
    );
    return this.completeStudy.getCurrentStudyData(this, {
      studyPath,
      deduplicatedPath,
      deduplicatedInstancesPath,
      studyInstanceUid,
    });
  };
}

module.exports = ScanStudy;
