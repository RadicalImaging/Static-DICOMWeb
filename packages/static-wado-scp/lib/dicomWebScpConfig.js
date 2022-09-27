const ConfigPoint = require("config-point");
const { staticWadoConfig } = require("@radicalimaging/static-wado-util");
const scpMain = require("./scpMain.js");

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { dicomWebScpConfig } = ConfigPoint.register({
  dicomWebScpConfig: {
    configBase: staticWadoConfig,
    isInstance: false,
    isGroup: true,
    isDeduplicate: true,
    isStudyData: true,
    maximumInlinePrivateLength: 64,
    maximumInlinePublicLength: 128 * 1024 + 2,
    helpShort: "dicomwebscp",
    helpDescription: "Creates server to receive data on DIMSE and store it DICOM",
    options: [
      {
        key: "-c, --clean",
        description: "Clean the outputs before generating/starting to write new values.",
        defaultValue: false,
      },
      {
        key: "-v, --verbose",
        description: "Write verbose output",
        defaultValue: false,
      },
      {
        key: "-t, --content-type <type>",
        description: "Destination type to compress to",
        defaultValue: "1.2.840.10008.1.2.4.80",
      },
      {
        key: "-r, --recompress <listvalue...>",
        description: "List of types to recompress separated by space",
        defaultValue: ["uncompressed", "jp2"],
        choices: ["uncompressed", "jp2", "jpeglossless", "rle", "none"],
      },
    ],
    programs: [
      {
        command: "scp",
        isDefault: true,
        main: scpMain,
        helpDescription: "Run a local SCP",
      },
    ],
  },
});

module.exports = dicomWebScpConfig;
