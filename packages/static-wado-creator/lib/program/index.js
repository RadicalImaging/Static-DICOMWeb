const staticWadoUtil = require("@ohif/static-wado-util");
const loadConfiguration = require("@ohif/static-wado-util/lib/loadConfiguration");
const StaticWado = require("../index");
const packageJson = require("../../package.json");
const adaptProgramOpts = require("../util/adaptProgramOpts");

const dicomwebDefaultDir = "~/dicomweb";

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults) {
  await loadConfiguration(defaults, process.argv);
  const { argumentsRequired = [], optionsRequired = [], helpShort, helpDescription } = defaults;

  const argumentsList = [
    {
      key: "<input...>",
      description: "List of files/directories/studyUids to be processed",
    },
  ];

  // program command options
  const optionsList = [
    {
      key: "-c, --clean",
      description: "Clean the study output directory for these instances",
      defaultValue: defaults.clean || false,
    },
    {
      key: "-d, --deduplicate",
      description: "Write deduplicate instance level data",
      defaultValue: defaults.isDeduplicate || false,
    },
    {
      key: "-g, --group",
      description: "Write combined deduplicate data",
      defaultValue: defaults.isGroup || false,
    },
    {
      key: "-i, --instances",
      description: "Write instance metadata",
      defaultValue: defaults.isInstanceMetadata || false,
    },
    {
      key: "-s, --study",
      description: "Write study metadata - on provided instances only (TO FIX},",
      defaultValue: defaults.isStudyData || false,
    },
    {
      key: "-C, --remove-deduplicated-instances",
      description: "Remove single instance deduplicated files after writing group files",
      defaultValue: defaults.removeDeduplicatedInstances || false,
    },
    {
      key: "-v, --verbose",
      description: "Write verbose output",
      defaultValue: false,
    },
    {
      key: "-T, --colour-content-type <value>",
      description: "Colour content type",
      defaultValue: null,
    },
    {
      key: "-t, --content-type <type>",
      description: "Content type",
      defaultValue: null,
    },
    {
      key: "-i, --input <input...>",
      description: "List of files/directories/studyUids to be processed",
      defaultValue: undefined,
    },
    {
      key: "-m, --maximum-inline-public-length <value>",
      description: "Maximum length of public binary data",
      defaultValue: 128 * 1024 + 2,
    },
    {
      key: "-o, --dir <value>",
      description: "Set output directory",
      defaultValue: dicomwebDefaultDir,
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
      key: "--no-recompress",
      description: "Force no recompression",
      defaultValue: false,
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
  ];

  const configuration = {
    argumentsList,
    argumentsRequired,
    helpDescription,
    helpShort,
    optionsList,
    optionsRequired,
    packageJson,
    configurationFile: defaults.configurationFile,
  };

  const program = staticWadoUtil.configureProgram(configuration);
  program.staticWadoCreator = adaptProgramOpts(program.opts(), defaults);
  program.main = function main() {
    const importer = new StaticWado(this.staticWadoCreator);
    return importer.executeCommand(this.args);
  };
  return program;
}

exports.configureProgram = configureProgram;
