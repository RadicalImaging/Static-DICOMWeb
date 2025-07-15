import ConfigPoint from "config-point";
import apiSimulator from "./api-simulator/index.mjs";
import webProxy from "./web-proxy/index.js";

const plugins = ConfigPoint.getConfig("plugins");

/**
 * Define all the local plugins here, so they can be loaded dynamically.
 */
ConfigPoint.extendConfiguration("plugins", {
  readSeriesIndex:
    "@radicalimaging/static-wado-plugins/lib/readSeriesIndex.plugin.js",
  studiesQueryByIndex:
    "@radicalimaging/static-wado-plugins/lib/studiesQueryByIndex.plugin.js",
  studiesQueryToScp:
    "@radicalimaging/static-wado-plugins/lib/studiesQueryToScp.plugin.js",
  // The point of plugins is that they can be lazy loaded, so no need to load s3 if not being used.
  s3Plugin: "@radicalimaging/s3-deploy/s3.plugin.mjs",
});

export { plugins, apiSimulator, webProxy };
