const ConfigPoint = require("config-point");

const { importPlugin } = ConfigPoint;

/**
 * Define all the local plugins here, so they can be loaded dynamically.
 */
const { plugins } = ConfigPoint.register({
  plugins: {
    readSeriesIndex: "@ohif/static-wado-plugins/lib/readSeriesIndex.plugin.js",
    studiesQueryByIndex: "@ohif/static-wado-plugins/lib/studiesQueryByIndex.plugin.js",
  },
});

const importer = (name) => import(name);

exports.importPlugin = (name) => importPlugin(name, importer);
exports.plugins = plugins;
