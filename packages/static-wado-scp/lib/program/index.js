const staticWadoUtil = require("@radicalimaging/static-wado-util");
const loadPlugins = require("../loadPlugins");

/**
 * Configure static-wado-scp commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults) {
  console.log("defaults=", defaults);
  const configurationFile = await staticWadoUtil.loadConfiguration(defaults, process.argv);
  console.log("Loaded configuration from", configurationFile);
  loadPlugins(defaults);  
  staticWadoUtil.configureCommands(defaults);
}

module.exports = configureProgram;
