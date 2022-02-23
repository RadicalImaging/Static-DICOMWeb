const ConfigPoint = require("config-point");
const { JSONReader } = require("@ohif/static-wado-util");

const readSeriesIndex = ConfigPoint.register({
  readSeriesIndex: {
    generator: (params) => (studyInstanceUID) => {
      console.log("Retrieve series", studyInstanceUID, "in", params.rootDir);
      return JSONReader(params.rootDir, `studies/{studyInstanceUID}/series/index.json.gz`);
    },
  },
});

module.exports = readSeriesIndex;
