const staticWadoConfig = require("../staticWadoConfig");

const diffObject = (update, base) => {
  if (!update) return undefined;
  if (!base) return update;
  let ret;
  for (const key of Object.keys(update)) {
    if (key == "configBase") continue;
    const old = base[key];
    const newV = update[key];
    if (newV === old || JSON.stringify(old) === JSON.stringify(newV)) continue;
    if (!ret) ret = Array.isArray(newV) ? [] : {};
    if (typeof update[key] === "object") {
      ret[key] = diffObject(update[key], base[key]);
    } else {
      ret[key] = update[key];
    }
  }
  return ret;
};

/**
 * Performs a difference in configuration between the provide value and the default static-wado-config, retaining only values
 * which are different from the base configuration, recursively.
 */
const configDiff = (newConfig) => diffObject(newConfig, staticWadoConfig.configBase);

module.exports = configDiff;
