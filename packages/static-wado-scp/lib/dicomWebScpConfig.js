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
    isAutoDeployS3: false,
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
        defaultValue: true,
      },
      {
        key: "-v, --verbose",
        description: "Write verbose output",
        defaultValue: false,
      },
      {
        key: "-t, --content-type <type>",
        description: "Destination type to compress to",
        defaultValue: "1.2.840.10008.1.2",
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
        key: "-rd, --root-dir <rootDir>",
        description: "Root directory of static wado",
        defaultValue: "~/dicomweb",
      },
      {
        key: "-s3cd, --s3-client-dir <s3ClientDir>",
        description: "S3 client directory of static wado",
        defaultValue: "~/ohif",
      },
      {
        key: "-s3rgb, --s3-rg-bucket <s3RootGroupBucket>",
        description: "S3 root group bucket of static wado",
      },
      {
        key: "-s3cgb, --s3-cg-bucket <s3ClientGroupBucket>",
        description: "S3 client group bucket of static wado",
      },
      {
        key: "-s3ea, --s3-env-account <s3EnvAccount>",
        description: "S3 account environment of static wado",
      },
      {
        key: "-s3er, --s3-env-region <s3EnvRegion>",
        description: "S3 region environment of static wado",
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
