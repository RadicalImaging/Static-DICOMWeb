const { ConfigPoint } = require("config-point");

const { staticWadoConfig } = ConfigPoint.register({
  staticWadoConfig: {
    rootDir: "~/dicomweb",
    pathDeduplicated: "deduplicated",
  },
});

module.exports = staticWadoConfig;
