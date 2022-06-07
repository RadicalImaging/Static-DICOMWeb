const ConfigPoint = require("config-point");
const apiSimulator = require("./api-simulator");
const webProxy = require("./web-proxy");

const plugins = ConfigPoint.getConfig("plugins");

/**
 * Define all the local plugins here, so they can be loaded dynamically.
 */
ConfigPoint.extendConfiguration("plugins", {
  readSeriesIndex: "@radical/static-wado-plugins/lib/readSeriesIndex.plugin.js",
  studiesQueryByIndex: "@radical/static-wado-plugins/lib/studiesQueryByIndex.plugin.js",
  studiesQueryToScp: "@radical/static-wado-plugins/lib/studiesQueryToScp.plugin.js",
  // The point of plugins is that they can be lazy loaded, so no need to load s3 if not being used.
  s3Plugin: "@radical/s3-deploy/build/lib/s3.plugin.mjs",
});

exports.plugins = plugins;
exports.apiSimulator = apiSimulator;
exports.webProxy = webProxy;
