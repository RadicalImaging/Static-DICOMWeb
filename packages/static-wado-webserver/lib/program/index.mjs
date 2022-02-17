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
  const {
    argumentsRequired = [],
    optionsRequired = [],
    helpShort,
    helpDescription,
  } = defaults;

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
    {
      key: "-c, --configuration <config-file.json5>",
      description:
        "Sets the base configurationfile, defaults to static-wado.json5 located in the current directory or in user home directory",
      defaultValue: ["./static-wado.json5", "~/static-wado.json5"],
    },
  ];

  const configuration = {
    argumentsList,
    argumentsRequired,
    helpDescription,
    helpShort,
    optionsList,
    optionsRequired,
  };

  return staticWadoUtil.configureProgram(configuration);
}

export default configureProgram;
