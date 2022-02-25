#!/usr/bin/env node

const { main } = require("../lib");
const { configureProgram } = require("../lib/program");
const adaptProgramOpts = require("../lib/util/adaptProgramOpts.js");

const defaults = {
  isStudyData: false,
  isInstanceMetadata: true,
  clean: true,
  argumentsRequired: ["input"],
  helpShort: "mkdicomwebinstances",
  helpDescription: "Takes DICOM part 10 files and writes the bulkdata/instance metadata.",
};

// Configure program commander
const program = configureProgram(defaults);
const configuration = adaptProgramOpts(program.opts());

main(configuration, program.args).then(() => {
  console.log("done");
});
