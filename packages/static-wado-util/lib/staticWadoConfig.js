const { ConfigPoint } = require("config-point");

const { staticWadoConfig } = ConfigPoint.register({
  staticWadoConfig: {
    // Allow access to the config base to compare to defaults.
    configBase: {
      rootDir: "~/dicomweb",
      pathDeduplicated: "deduplicated",
      configurationFile: ["./static-wado.json5", "~/static-wado.json5"],
      recompress: [""],
      recompressThumb: [""],
      // True means compress to gzip for dicomweb and to brotli for OHIF client
      compress: true,
      studyQuery: "studiesQueryByIndex",
      staticWadoAe: "DICOMWEB",

      // Items dealing with deployment - these are skeletons with the default values only
      groupNames: ["root", "client"],
      rootGroup: {
        path: "/dicomweb",
        IndexDocument: {
          suffix: "json",
        },
      },
      clientGroup: {
        path: "/",
        IndexDocument: {
          suffix: "html",
        },
      },
    },
  },
});

module.exports = staticWadoConfig;
