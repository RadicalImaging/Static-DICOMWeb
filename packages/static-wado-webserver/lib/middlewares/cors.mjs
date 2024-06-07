import cors from "cors";
import isCorsEnabled from "../util/isCorsEnabled.mjs";

function getCorsOptions(config = {}) {
  const { corsOptions } = config;
  const defaultOptions = {};

  const corsOptionsCpy = { ...corsOptions };

  delete corsOptionsCpy.enabled;

  return { ...defaultOptions, ...corsOptionsCpy };
}

/**
 * Set all app middlewares
 *
 * @param {*} appExpress express instance
 * @param {*} config configuration to define whether applying cors or not.
 */
export default function setMiddlewares(appExpress, config) {
  const corsOptions = getCorsOptions(config);
  if (isCorsEnabled(config)) {
    console.warn("Cors is enabled", corsOptions);
    appExpress.use("/", cors(corsOptions));
  } else {
    console.log("cors is not enabled");
  }
}
