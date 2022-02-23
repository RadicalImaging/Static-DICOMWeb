const { loadFile } = require("config-point");
const fs = require("fs");
const handleHomeRelative = require("./handleHomeRelative");

/**
 * Loads the configurationFiles elements, returning a promise that resolves on the first file loaded successfully,
 * or resolves if no configuration file is found.
 * Fails if the parse fails for any reason.
 */
module.exports = (configurationFilesSrc) => {
  if (!configurationFilesSrc) return Promise.resolve();
  const configurationFiles = (Array.isArray(configurationFilesSrc) && configurationFilesSrc) || [configurationFilesSrc];
  for (const configFile of configurationFiles) {
    const filename = handleHomeRelative(configFile);
    if (fs.existsSync(filename)) {
      console.log("Using configuration", filename);
      return loadFile(filename, fs.promises);
    }
  }
  return Promise.resolve();
};
