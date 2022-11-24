import staticWadoUtil from "@radicalimaging/static-wado-util";
import "../index.mjs";

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults = {}) {
  const configurationFile = await staticWadoUtil.loadConfiguration(defaults, process.argv);
  console.log("Loaded configuration from", configurationFile);
  defaults.configurationFile = configurationFile;
  staticWadoUtil.configureCommands(defaults);
}

export default configureProgram;
