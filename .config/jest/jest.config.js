const path = require("path");
const packageRoot = path.resolve(process.cwd());
const parentPackageRoot = path.resolve(__dirname, "../../");

const configRoot = path.join(parentPackageRoot, "/.config/jest");

module.exports = {
  roots: [
    "<rootDir>",
    ".",
  ],
  verbose: true,
   moduleFileExtensions: [
    "mjs",
    "js",
  ],
  transform: {
    "^.+\\.(js|jsx|mjs)$": "babel-jest",
  },
  transformIgnorePatterns: [
      "[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs)$"
  ],
  moduleNameMapper: {
    "(.*)-(charls|openjpeg)\/wasmjs": "$1-$2/dist/$2wasm.js",
    "(.*)-(libjpeg)-(turbo)-(8bit)\/wasmjs": "$1-$2-$3-$4/dist/$2$3wasm.js",
  },
  moduleDirectories: [
    "<rootDir>/node_modules",
    "node_modules",
    "lib",
    "tests",
    "bin",
  ],
  testEnvironment: "node",
  globals: {
    TEST_DATA_PATH: path.join(parentPackageRoot, "/testdata"),
    OUTPUT_TEMP_PATH: path.join(packageRoot, "/tmp/dicomweb"),
  },
  testRegex: "./tests/.+.m?js$",
  setupFilesAfterEnv: [path.join(configRoot, "/jest.setup.js")],
  globalTeardown: path.join(configRoot, "/jest.global.teardown.js"),
};
