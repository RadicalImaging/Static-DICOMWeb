const path = require("path");
const packageRoot = path.resolve(process.cwd());
const parentPackageRoot = path.resolve(__dirname, "../../");

const configRoot = path.join(parentPackageRoot, "/.config/jest");

module.exports = {
  verbose: true,
  globals: {
    TEST_DATA_PATH: path.join(parentPackageRoot, "/testdata"),
    OUTPUT_TEMP_PATH: path.join(packageRoot, "/tmp/dicomweb"),
  },
  testRegex: "./tests/.+.js$",
  setupFilesAfterEnv: [path.join(configRoot, "/jest.setup.js")],
  globalTeardown: path.join(configRoot, "/jest.global.teardown.js"),
};
