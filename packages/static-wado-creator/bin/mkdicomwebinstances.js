#!/usr/bin/env node

const { main } = require("../lib");
const { configureProgram } = require("../lib/program");

const defaults = {
  isStudyData: false,
  isInstanceMetadata: true,
  clean: true,
  argumentsRequired: ["input"],
  helpShort: "mkdicomwebinstances",
  helpDescription: "Takes DICOM part 10 files and writes the bulkdata/instance metadata.",
};

// Configure program commander
configureProgram(defaults);

main(defaults).then(() => {
  console.log("done");
});
