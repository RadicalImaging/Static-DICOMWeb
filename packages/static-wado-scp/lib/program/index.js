const staticWadoUtil = require("@ohif/static-wado-util");
const packageJson = require("../../package.json");

/**
 * Configure static-wado-scp commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
function configureProgram(defaults) {
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

  return staticWadoUtil.configureProgram(configuration);
}

exports.configureProgram = configureProgram;
