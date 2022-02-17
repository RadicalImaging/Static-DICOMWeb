const { Stats } = require("@ohif/static-wado-util");
const { JSONReader } = require("@ohif/static-wado-util");
const JSONWriter = require("./JSONWriter");
const StudyData = require("../operation/StudyData");
const Tags = require("../dictionary/Tags");

/**
 * CompleteStudyWriter takes the deduplicated data values, all loaded into the study parameter,
 * and writes it out as various dataset types.  The options parameters define what types it gets
 * written out as.
 * The studyData object is then removed, so that a new one can be created if required.
 */
const CompleteStudyWriter = (options) => {
  async function ret() {
    const { studyData } = this;
    if (!studyData) return;

    if (!studyData.numberOfInstances) {
      console.log("studyData.deduplicated is empty");
      delete this.studyData;
      return;
    }

    if (options.isGroup) {
      if (studyData.dirty) {
        await studyData.writeDeduplicatedGroup();
        console.log(
          "Wrote updated deduplicated data for study",
          studyData.studyInstanceUid
        );
      } else {
        console.log(
          "Not writing new deduplicated data because it is clean:",
          studyData.studyInstanceUid
        );
      }
    }

    if (!options.isStudyData) {
      delete this.studyData;
      Stats.StudyStats.summarize();
      return;
    }

    const isDirtyMetadata = await studyData.dirtyMetadata();
    if (!isDirtyMetadata) {
      console.log(
        "Study metadata",
        studyData.studyInstanceUid,
        "has clean metadata, not writing"
      );
      delete this.studyData;
      Stats.StudyStats.summarize(
        `Study metadata ${studyData.studyInstanceUid} has clean metadata, not writing`
      );
      return;
    }

    const studyQuery = await studyData.writeMetadata();

    const allStudies = await JSONReader(
      options.directoryName,
      "studies/index.json.gz",
      []
    );
    if (!studyQuery[Tags.StudyInstanceUID]) {
      console.error("studyQuery=", studyQuery);
    }
    const studyUID = studyQuery[Tags.StudyInstanceUID].Value[0];
    const studyIndex = allStudies.findIndex(
      (item) => item[Tags.StudyInstanceUID].Value[0] == studyUID
    );
    if (studyIndex == -1) {
      allStudies.push(studyQuery);
    } else {
      allStudies[studyIndex] = studyQuery;
    }
    JSONWriter(options.directoryName, "studies", allStudies);
    delete this.studyData;
    Stats.StudyStats.summarize(
      `Wrote study metadata/query files for ${studyData.studyInstanceUid}`
    );
  }

  /**
   * Gets a current study data object, or completes the old one and generates a new one.
   * async call as it may need to store the current study data value.
   */
  ret.getCurrentStudyData = async (callback, id) => {
    const { studyData } = callback;
    const { studyInstanceUid } = id;

    if (studyData) {
      if (studyData.studyInstanceUid == studyInstanceUid) {
        return studyData;
      }
      await callback.completeStudy(studyData);
    }
    callback.studyData = new StudyData(id, options);
    await callback.studyData.init(options);
    return callback.studyData;
  };

  return ret;
};

module.exports = CompleteStudyWriter;
