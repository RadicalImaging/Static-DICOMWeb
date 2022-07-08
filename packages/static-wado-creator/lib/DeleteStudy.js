const { JSONReader } = require("@radical/static-wado-util");
const JSONWriter = require("./writer/JSONWriter");
const Tags = require("./dictionary/Tags");

module.exports = (options) =>
  async function (studyInstanceUid) {
    console.log("Delete Study", studyInstanceUid);
    const studyData = await this.scanStudy("studies", studyInstanceUid);
    studyData.delete();
    const allStudies = await JSONReader(options.directoryName, "studies/index.json.gz", []);
    const studiesWithoutDeleted = allStudies.filter((study) => studyInstanceUid != Tags.getValue(study,Tags.StudyInstanceUID));
    await JSONWriter(options.directoryName, "studies", studiesWithoutDeleted);
    delete this.studyData;
  };
