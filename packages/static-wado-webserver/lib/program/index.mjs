import * as staticWadoUtil from "@radicalimaging/static-wado-util";
import dicomWebServerConfig from "../dicomWebServerConfig.mjs";
import DicomWebServer from "../index.mjs";

function main() {
  return DicomWebServer(this.dicomWebServerConfig).then((value) =>
    value.listen()
  );
}

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults = dicomWebServerConfig) {
  await staticWadoUtil.loadConfiguration(defaults, process.argv);

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
      key: "-q, --quiet",
      description: "Quiet/minimal output",
      defaultValue: false,
    },
    {
      key: "-o, --dir <value>",
      description: "Set output directory (to read from for serving files)",
      defaultValue: defaults.rootDir,
    },
    {
      key: "-p, --port <value>",
      description: "Choose the port to run on",
      defaultValue: defaults.port,
    },
    {
      key: "--hash-study-uid-path",
      description: "Enable hashing of studyUID folder structure",
      defaultValue: false,
    },
    {
      key: "--server-path <path>",
      description: "Sets the server path to listen to",
      defaultValue: "/dicomweb",
    },
    {
      key: "--client-path <clientPath>",
      description: "Sets the client path to listen to",
      defaultValue: "/",
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
  program.dicomWebServerConfig.port = opts.port || 5000;

  program.main = main;

  return program;
}

export default configureProgram;
