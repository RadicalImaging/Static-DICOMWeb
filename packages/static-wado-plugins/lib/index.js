const ConfigPoint = require("config-point");
const apiSimulator = require("./api-simulator");
const webProxy = require("./web-proxy");

const { importPlugin } = ConfigPoint;

/**
 * Define all the local plugins here, so they can be loaded dynamically.
 */
const { plugins } = ConfigPoint.register({
  plugins: {
    readSeriesIndex: "@ohif/static-wado-plugins/lib/readSeriesIndex.plugin.js",
    studiesQueryByIndex: "@ohif/static-wado-plugins/lib/studiesQueryByIndex.plugin.js",
    studiesQueryToScp: "@ohif/static-wado-plugins/lib/studiesQueryToScp.plugin.js",
    // The point of plugins is that they can be lazy loaded, so no need to load s3 if not being used.
    s3Plugin: "@radical/s3-deploy/lib/s3.plugin.mjs",
  },
});

const importer = (name) => import(name);

exports.importPlugin = (name) => importPlugin(name, importer);
exports.plugins = plugins;
exports.apiSimulator = apiSimulator;
exports.webProxy = webProxy;