module.exports = {
  verbose: true,
  runner: "jest-runner-mocha",
  // just does not yet support subpath export from node
  moduleNameMapper: {
    "(.*)-(charls|openjpeg)\/wasmjs": "<rootDir>/node_modules/$1-$2/dist/$2wasm.js",
    "(.*)-(libjpeg)-(turbo)-(8bit)\/wasmjs": "<rootDir>/node_modules/$1-$2-$3-$4/dist/$2$3wasm.js",
  },
}