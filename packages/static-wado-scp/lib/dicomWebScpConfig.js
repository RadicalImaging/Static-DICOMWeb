const ConfigPoint = require("config-point");
const StaticCreator = require("@ohif/static-wado-creator");

const { staticWadoConfig } = StaticCreator;

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
    scpAe: "DICOMWEB",
    scpPort: 11112,
  },
});

module.exports = dicomWebScpConfig;
