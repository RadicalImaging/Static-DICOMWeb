const ConfigPoint = require("config-point");
const { staticWadoConfig } = require("@radicalimaging/static-wado-util");
const createMain = require("./createMain");
const createPart10 = require("./createPart10");
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
        key: "-c <configFile.json5>",
        description: "Use an alternate configuration file",
        defaultValue: "~/static-wado.json5",
      },
      {
        key: "--clean",
        description: "Clean the outputs before generating/starting to write new values.",
        defaultValue: false,
      },
      {
        key: "-d, --deployments <listvalue...>",
        description: "List of deployments from configuration to deploy to. Separated by space.",
        defaultValue: undefined,
      },
      {
        key: "--no-notifications",
        description: "Turns off notifications",
      },
      {
        key: "--delete",
        description: "Delete the imported instances",
        defaultValue: false,
      },
      {
        key: "--lossy",
        description: "Generate lossy instances instead of lossless",
        defaultValue: false,
      },
      {
        key: "--alternate <type>",
        description: "Generates an alternate representaton of the image generally in the /lossy sub-directory",
        choices: ["jhc", "jls", "jhcLossless", "jlsLossless"],
      },
      {
        key: "--alternate-thumbnail",
        description: "Generates a thumbnail for the alternate representation",
      },
      {
        key: "--alternate-name <dir>",
        description: "Uses a given sub directory name",
        defaultValue: "lossy",
      },
      {
        key: "-v, --verbose",
        description: "Write verbose output",
        defaultValue: false,
      },
      {
        key: "-t, --content-type <type>",
        description: 'Destination type to compress to (choices: "jpeg", "jls", "lei", "jls-lossy", "jhc", "jxl" or DICOM Transfer Syntax UID - default: "jls")',
        defaultValue: "jls",
        customParser: compressionOptionParser,
      },
      {
        key: "--encapsulated-image",
        description: "Avoid encapsulating the image frame.  Writes with the extension and without multipart",
      },
      {
        key: "-e, --no-encapsulated-image",
        description: "Avoid encapsulating the image frame.  Writes with the extension and without multipart",
      },
      {
        key: "--single-part-image",
        description: "Writes single part image data",
      },
      {
        key: "--no-single-part-image",
        description: "Writes single part image data",
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
        defaultValue: ["uncompressed", "jp2", "jls", "jll"],
        choices: ["uncompressed", "jp2", "jpeg", "jpeglossless", "rle", "jph", "jls", "true", "none"],
      },
      {
        key: "--recompress-color <listvalue...>",
        description: "List of types to recompress for color images, separated by space",
        defaultValue: ["uncompressed"],
        choices: ["uncompressed", "jpeg", "jp2", "jpeglossless", "rle", "jph", "jls", "true", "none"],
      },
      {
        key: "-f, --force",
        description: "Force the update even if the SOP exists",
        defaultValue: false,
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
        key: "--thumb",
        description: "Generate thumbnails",
      },
      {
        key: "--dcm2jpg",
        description: "Use dcm2jpg for thumbnail image generation",
        defaultValue: false,
      },
      {
        key: "--rendered",
        description: "Use dcm2jpg to generate a rendered PNG image",
        defaultValue: false,
      },
      {
        key: "-T, --color-content-type <value>",
        description: "Colour content type",
        defaultValue: "jpeg",
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
          "Make DICOMweb query and metadata from binary Part 10 DICOM files.  Does a full read\n" +
          "of deduplicated files each time a study instance UID is found, and only updates\n" +
          "those studies having at least one ",
      },
      {
        command: "part10",
        arguments: ["studyUID"],
        main: createPart10,
        helpDescription: "Store the specified study as part 10 data",
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
        helpDescription: "Write the metadata object (series and study details) from the grouped deduplicated data.",
      },
      {
        command: "delete",
        main: deleteMain,
        helpDescription: "Delete the given study, series or instance (not yet implemented)",
      },
      {
        command: "reject <studyUID...>",
        main: rejectMain,
        helpDescription: "Reject the specified series",
      },
    ],
  },
});

module.exports = mkdicomwebConfig;
