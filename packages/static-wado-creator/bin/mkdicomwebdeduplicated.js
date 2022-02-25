#!/usr/bin/env node

const { main } = require("../lib");
const { configureProgram } = require("../lib/program");
const adaptProgramOpts = require("../lib/util/adaptProgramOpts.js");

const defaults = {
  isStudyData: false,
  isGroup: false,
  isDeduplicate: true,
  argumentsRequired: ["input"],
  helpShort: "mkdicomwebdeduplicated",
  helpDescription: "Makes deduplicated instance level files from a set of DICOM part 10 files.\nDoes not write sets of deduplicated files by default.",
};
// Configure program commander
const program = configureProgram(defaults);
const configuration = adaptProgramOpts(program.opts());

main(configuration, program.args).then(() => {
  console.log("done");
});
