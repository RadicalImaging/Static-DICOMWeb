const staticWadoUtil = require("@radicalimaging/static-wado-util");

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
