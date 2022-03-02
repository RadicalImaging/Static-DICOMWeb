const ConfigPoint = require("config-point");
const { staticWadoConfig } = require("@ohif/static-wado-util");

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { dicomWebScpConfig } = ConfigPoint.register({
  dicomWebScpConfig: {
    configBase: staticWadoConfig,
    isStudyData: true,
    isGroup: true,
    helpShort: "dicomwebscp",
    helpDescription: "Creates server to receive data on DIMSE and store it DICOM",
  },
});

module.exports = dicomWebScpConfig;
