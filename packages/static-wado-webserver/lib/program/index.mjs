import staticWadoUtil from "@ohif/static-wado-util";
import dicomWebServerConfig from "../dicomWebServerConfig.mjs";

const dicomwebDefaultDir = dicomWebServerConfig.rootDir;

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
function configureProgram(defaults) {
  const { argumentsRequired = [], optionsRequired = [], helpShort, helpDescription } = defaults;

  const argumentsList = [];

  // program command options
  const optionsList = [
    {
      key: "-v, --verbose",
      description: "Write verbose output",
      defaultValue: false,
    },
    {
      key: "-o, --dir <value>",
      description: "Set output directory (to read from for serving files)",
      defaultValue: dicomwebDefaultDir,
    },
  ];

  const configuration = {
    argumentsList,
    argumentsRequired,
    helpDescription,
    helpShort,
    optionsList,
    optionsRequired,
    configurationFile: defaults.configurationFile,
  };

  return staticWadoUtil.configureProgram(configuration);
}

export default configureProgram;
