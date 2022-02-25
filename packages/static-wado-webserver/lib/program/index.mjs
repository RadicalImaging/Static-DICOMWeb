import staticWadoUtil from "@ohif/static-wado-util";
import dicomWebServerConfig from "../dicomWebServerConfig.mjs";
import DicomWebServer from "../index.mjs";

function main() {
  return DicomWebServer(this.dicomWebServerConfig).then((value) => value.listen());
}

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults = dicomWebServerConfig) {
  await staticWadoUtil.loadConfiguration(defaults, process.argv);

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
      defaultValue: defaults.rootDir,
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

  const program = staticWadoUtil.configureProgram(configuration);
  const opts = program.opts();
  program.dicomWebServerConfig = Object.assign(Object.create(defaults), opts);
  program.dicomWebServerConfig.rootDir = opts.dir;

  program.main = main;

  return program;
}

export default configureProgram;
