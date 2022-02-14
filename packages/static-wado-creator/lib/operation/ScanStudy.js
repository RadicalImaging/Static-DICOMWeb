const path = require('path')
const StudyData = require('./StudyData')

function ScanStudy(options) {
    const {directoryName, deduplicatedRoot, deduplicatedInstancesRoot} = options;

    return async function (dir,studyInstanceUid) {

        const studyPath = path.join(directoryName, 'studies', studyInstanceUid)
        const deduplicatedPath = path.join(deduplicatedRoot, studyInstanceUid);
        const deduplicatedInstancesPath = path.join(deduplicatedInstancesRoot,studyInstanceUid);
        console.log('Scanning', dir, studyInstanceUid);
        await this.completeStudy.getCurrentStudyData(this,{
            studyPath,
            deduplicatedPath, 
            deduplicatedInstancesPath,
            studyInstanceUid,
        });
    }
}

module.exports = ScanStudy;