const staticWadoUtil = require("@ohif/static-wado-util");
const { DcmjsDimseScp, Server, loadPlugins } = require("..");
const packageJson = require("../../package.json");

function main() {
  const port = this.dicomWebScpConfig.scpPort || 11112;

  const server = new Server(DcmjsDimseScp);
  server.on("networkError", (e) => {
    console.log("Network error: ", e);
  });
  console.log(`Starting server listen on port ${port}`);
  server.listen(port);
}

/**
 * Configure static-wado-scp commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults) {
  await staticWadoUtil.loadConfiguration(defaults, process.argv);

  const { argumentsRequired = [], optionsRequired = [], helpShort, helpDescription } = defaults;

  const configuration = {
    argumentsList: [],
    argumentsRequired,
    helpDescription,
    helpShort,
    optionsList: [],
    optionsRequired,
    packageJson,
    configurationFile: defaults.configurationFile,
  };

  const program = staticWadoUtil.configureProgram(configuration);

  program.dicomWebScpConfig = defaults;
  program.main = main;

  loadPlugins(program.dicomWebScpConfig);

  return program;
}

exports.configureProgram = configureProgram;
