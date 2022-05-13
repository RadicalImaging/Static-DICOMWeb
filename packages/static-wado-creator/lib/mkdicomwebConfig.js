const ConfigPoint = require("config-point");
const { staticWadoConfig } = require("@ohif/static-wado-util");
const createMain = require("./createMain");
const deleteMain = require("./deleteMain");
const rejectMain = require("./rejectMain");

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 */
const { mkdicomwebConfig } = ConfigPoint.register({
  mkdicomwebConfig: {
    // This declare the inheritted configuration, don't assume this is directly accessible
    configBase: staticWadoConfig,
    isStudyData: true,
    isGroup: true,
    options: [
      {
        key: "-c, --clean",
        description: "Clean the study output directory for these instances",
        defaultValue: false,
      },
      {
        key: "-v, --verbose",
        description: "Write verbose output",
        defaultValue: false,
      },
      {
        key: "-t, --content-type <type>",
        description: "Content type",
        defaultValue: null,
      },
      {
        key: "-m, --maximum-inline-public-length <value>",
        description: "Maximum length of public binary data",
        defaultValue: 128 * 1024 + 2,
      },
      {
        key: "-o, --dir <value>",
        description: "Set output directory",
        defaultValue: "~/dicomweb", // defaults.rootDir,
      },
      {
        key: "-M, --maximum-inline-private-length <value>",
        description: "Maximum length of private binary data",
        defaultValue: 64,
      },
      {
        key: "-r, --recompress <listvalue...>",
        description: "List of types to recompress separated by comma",
        defaultValue: ["uncompressed", "jp2"],
        choices: ["uncompressed", "jp2", "jpeglossless", "rle"],
      },
      {
        key: "--recompress-thumb <listvalue...>",
        description: "List of types to recompress thumb separated by comma",
        defaultValue: ["uncompressed", "jp2"],
        choices: ["uncompressed", "jp2", "jpeglossless", "rle"],
      },
      {
        key: "--no-recompress",
        description: "Force no recompression",
        defaultValue: false,
      },
      {
        key: "--no-recompress-thumb",
        description: "Force no recompression thumbnail",
        defaultValue: false,
      },
      {
        key: "-T, --colour-content-type <value>",
        description: "Colour content type",
        defaultValue: null,
      },
      {
        key: "--path-deduplicated <path>",
        description: "Set the deduplicate data directory path (relative to dir)",
        defaultValue: "deduplicated",
      },
      {
        key: "--path-instances <path>",
        description: "Set the instances directory path (relative to dir)",
        defaultValue: "instances",
      },
    ],
    programs: [
      {
        command: "create",
        isDefault: true,
        arguments: ["input"],
        main: createMain,
        helpDescription:
          "Make DICOMweb query and metadata from binary Part 10 DICOM files.  Does a full read of\n" +
          "deduplicated files each time a study instance UID is found, and only updates those studies\n" +
          "having at least one ",
      },
      {
        command: "delete",
        main: deleteMain,
        helpDescription: "Delete the given study, series or instance.",
      },
      {
        command: "reject",
        main: rejectMain,
        helpDescription: "Reject the specified series, specified as studies/<studyUID>/series/<seriesUID>",
      },
    ],
  },
});

module.exports = mkdicomwebConfig;
