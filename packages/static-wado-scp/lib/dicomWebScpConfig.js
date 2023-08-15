const ConfigPoint = require("config-point");
const { staticWadoConfig } = require("@radicalimaging/static-wado-util");
const scpMain = require("./scpMain.js");
const cstoreMain = require("./cstoreMain.js");

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
      {
        key: "-p, --scp-port <scpPort>",
        description: "Port number to run on",
        defaultValue: 11112,
      },
      {
        key: "-a, --ae <AEName@host:port>",
        description: "Add an AE name as a destination AE",
      },
    ],
    programs: [
      {
        command: "scp",
        isDefault: true,
        main: scpMain,
        helpDescription: "Run a local SCP",
      },
      {
        command: "cstore <destinationAE> <studyUIDs...>",
        arguments: ["destinationAE", "studyUIDs"],
        main: cstoreMain,
        helpDescription: "C-Store to a specified back end",
      },
    ],
  },
});

module.exports = dicomWebScpConfig;
