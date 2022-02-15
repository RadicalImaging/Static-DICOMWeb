const baseConfig = require("../../.config/jest/jest.config");

module.exports = {
  ...baseConfig,
  // just does not yet support subpath export from node
  moduleNameMapper: {
    "(.*)-(charls|openjpeg)\/wasmjs": "$1-$2/dist/$2wasm.js",
    "(.*)-(libjpeg)-(turbo)-(8bit)\/wasmjs": "$1-$2-$3-$4/dist/$2$3wasm.js",
  },
}