const path = require("path");

const packageRoot = path.resolve(__dirname, './');
const parentPackageRoot = path.resolve(__dirname, "../../");

module.exports = {
  verbose: true,
  globals: {
    TEST_DATA_PATH: path.join(parentPackageRoot, "/testdata"),
    OUTPUT_TEMP_PATH: path.join(packageRoot, "/tmp/dicomweb"),
  },
  setupFilesAfterEnv: [path.join(packageRoot, '/jest.setup.js')],
  globalTeardown: path.join(packageRoot, '/jest.global.teardown.js'),
  // just does not yet support subpath export from node
  moduleNameMapper: {
    "(.*)-(charls|openjpeg)\/wasmjs": "$1-$2/dist/$2wasm.js",
    "(.*)-(libjpeg)-(turbo)-(8bit)\/wasmjs": "$1-$2-$3-$4/dist/$2$3wasm.js",
  },
}