const { ConfigPoint } = require("config-point");

const { staticWadoConfig } = ConfigPoint.register({
  staticWadoConfig: {
    rootDir: "~/dicomweb",
    pathDeduplicated: "deduplicated",
    configurationFile: ["./static-wado.json5", "~/static-wado.json5"],
  },
});

module.exports = staticWadoConfig;
