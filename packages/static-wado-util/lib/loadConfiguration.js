const { loadFile } = require("config-point");
const fs = require("fs");
const handleHomeRelative = require("./handleHomeRelative");

const getConfigurationFile = (args, defValue) => {
  for (let i = 1; i < args.length - 1; i++) {
    const arg = args[i];
    if (arg == "-c" || arg == "--configuration" || arg == "-configuration") {
      return args[i + 1];
    }
  }
  return defValue;
};

/**
 * Loads the configurationFiles elements, returning a promise that resolves on the first file loaded successfully,
 * or resolves if no configuration file is found.
 * Fails if the parse fails for any reason.
 */
module.exports = (defaults, argvSrc) => {
  const args = argvSrc || process.argv || [];
  const configurationFile = getConfigurationFile(args, defaults.configurationFile);
  if (!configurationFile || configurationFile === "false") return Promise.resolve();

  const configurationFiles = (Array.isArray(configurationFile) && configurationFile) || [configurationFile];
  for (const configFile of configurationFiles) {
    const filename = handleHomeRelative(configFile);
    if (fs.existsSync(filename)) {
      console.log("Using configuration", filename);
      return loadFile(filename, fs.promises).then(() => filename);
    }
  }
  return Promise.resolve();
};
