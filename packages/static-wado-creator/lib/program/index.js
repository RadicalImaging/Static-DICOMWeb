const staticWadoUtil = require("@ohif/static-wado-util");
const StaticWado = require("../index");
const packageJson = require("../../package.json");
const adaptProgramOpts = require("../util/adaptProgramOpts");

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults) {
  const configurationFile = await staticWadoUtil.loadConfiguration(defaults, process.argv);
  console.log("Loaded configuration from", configurationFile);
  staticWadoUtil.configureCommands(defaults);
}

exports.configureProgram = configureProgram;
