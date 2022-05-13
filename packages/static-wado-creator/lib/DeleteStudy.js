const { JSONReader } = require("@ohif/static-wado-util");
const JSONWriter = require("./writer/JSONWriter");
const Tags = require("./dictionary/Tags");

module.exports = (options) =>
  async function (studyInstanceUid) {
    console.log("Delete Study", studyInstanceUid);
    const studyData = await this.scanStudy("studies", studyInstanceUid);
    studyData.delete();
    const allStudies = await JSONReader(options.directoryName, "studies/index.json.gz", []);
    const studiesWithoutDeleted = allStudies.filter(study => studyInstanceUid!=study[Tags.StudyInstanceUID].Value[0]);
    await JSONWriter(options.directoryName, "studies", studiesWithoutDeleted);
    delete this.studyData;
  };
