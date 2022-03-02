const ConfigPoint = require("config-point");
const { staticWadoConfig } = require("@ohif/static-wado-util");

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { mkdicomwebConfig } = ConfigPoint.register({
  mkdicomwebConfig: {
    // This declare the inheritted configuration, don't assume this is directly accessible
    configBase: staticWadoConfig,
    isStudyData: true,
    isGroup: true,
    argumentsRequired: ["input"],
    helpShort: "mkdicomweb",
    helpDescription:
      "Make DICOMweb query and metadata from binary Part 10 DICOM files.  Does a full read of\n" +
      "deduplicated files each time a study instance UID is found, and only updates those studies\n" +
      "having at least one ",
  },
});

module.exports = mkdicomwebConfig;
