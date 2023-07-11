const { testdataConfig } = require("../config");
const { configureProgram } = require("../lib/program");

// Configure program commander
configureProgram(testdataConfig).then(() => {
  console.verbose("done");
});
