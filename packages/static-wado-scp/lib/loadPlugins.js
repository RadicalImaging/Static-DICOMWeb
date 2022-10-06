const { plugins } = require("@radicalimaging/static-wado-plugins");

const loadedPlugins = {};

const loadPlugins = (options) => {
  const { studyQuery } = options;
  console.log("Using study query", studyQuery);
  return import(plugins[studyQuery])
    .then((value) => {
      const theImport = value.default || value;
      loadedPlugins.STUDY = theImport.generator(options);
    })
    .catch((reason) => {
      console.log("Unable to load plugin because", reason);
      // eslint-disable-next-line no-process-exit
      process.exit(-1);
    });
};

module.exports = loadPlugins;
