const ConfigPoint = require("config-point");
const { staticWadoConfig } = require("@radicalimaging/static-wado-util");

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { dicomWebScpConfig } = ConfigPoint.register({
  dicomWebScpConfig: {
    configBase: staticWadoConfig,
    isStudyData: true,
    isGroup: true,
    maximumInlinePrivateLength: 64,
    maximumInlinePublicLength: 128 * 1024 + 2,
    helpShort: "dicomwebscp",
    helpDescription: "Creates server to receive data on DIMSE and store it DICOM",
  },
});

module.exports = dicomWebScpConfig;
