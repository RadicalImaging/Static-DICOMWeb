const ConfigPoint = require("config-point");
const { staticWadoConfig } = require("@radicalimaging/static-wado-util");
const createMain = require("./createMain");
const deleteMain = require("./deleteMain");
const rejectMain = require("./rejectMain");
const instanceMain = require("./instanceMain");
const indexMain = require("./indexMain");
const groupMain = require("./groupMain");
const metadataMain = require("./metadataMain");
const compressionOptionParser = require("./util/compressionOptionParser");

/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 * TODO - fix the default values so they come from the configuration file.  In the meantime, leave the defaults blank.
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
        description: 'Destination type to compress to (choices: "jls", "lei", "jls-lossy" or DICOM Transfer Syntax UID - default: "jls")',
        defaultValue: "jls",
        customParser: compressionOptionParser,
      },
      {
        key: "-m, --maximum-inline-public-length <value>",
        description: "Maximum length of public binary data",
        defaultValue: 128 * 1024 + 2,
      },
      {
        key: "-M, --maximum-inline-private-length <value>",
        description: "Maximum length of private binary data",
        defaultValue: 64,
      },
      {
        key: "-r, --recompress <listvalue...>",
        description: "List of types to recompress separated by space",
        defaultValue: ["uncompressed", "jp2"],
        choices: ["uncompressed", "jp2", "jpeglossless", "rle", "none"],
      },
      {
        key: "--recompress-thumb <listvalue...>",
        description: "List of types to recompress thumb separated by space",
        defaultValue: ["uncompressed", "jp2"],
        choices: ["uncompressed", "jp2", "jpeglossless", "rle", "none"],
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
      {
        key: "--store-multipart-bulk-data",
        description: "Use multipart encoding for non image frame bulkdata",
        defaultValue: false,
      },
      {
        key: "--prepend-bulk-data-uri <value>",
        description: "Prepend bulkdata uri (ex. to use absolute Uri like http://host:3000/dicomweb)",
        defaultValue: "",
      },
      {
        key: "--expand-bulk-data-uri",
        description: "expand bulkdata relative uri to use full relative path (should also be set when using --prepend-bulk-data-uri)",
        defaultValue: false,
      },
      {
        key: "-o, --dir <value>",
        description: "Set output directory",
        defaultValue: { configOperation: "reference", source: "staticWadoConfig", reference: "rootDir" },
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
        command: "index",
        main: indexMain,
        helpDescription: "Recreate the index for the DICOMweb data.",
      },
      {
        command: "instance",
        arguments: ["input"],
        main: instanceMain,
        helpDescription: "Make instance level DICOMweb metadata and bulkdata, but don't group or write series metadata",
      },
      {
        command: "group",
        arguments: ["input"],
        main: groupMain,
        helpDescription: "Group instance level metadata into deduplicated data.\nDeletes instance level deduplicated information once it is confirmed written.",
      },
      {
        command: "metadata",
        arguments: ["input"],
        main: metadataMain,
        helpDescription: "Write the metadata object (series and study details) from the deduplicated data.",
      },
      {
        command: "delete",
        main: deleteMain,
        helpDescription: "Delete the given study, series or instance (not yet implemented)",
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
