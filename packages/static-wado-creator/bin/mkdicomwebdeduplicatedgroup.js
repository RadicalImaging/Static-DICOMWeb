#!/usr/bin/env node

const { main } = require("../lib");
const { configureProgram } = require("../lib/program");
const adaptProgramOpts = require("../lib/util/adaptProgramOpts.js");

const defaults = {
  isStudyData: false,
  scanStudies: "deduplicatedInstancesRoot",
  isGroup: true,
  removeDeduplicatedInstances: true,
  helpShort: "mkdicomwebdeduplicatedgroup",
  helpDescription:
    "Makes sets of deduplicated instances out of the single instance deduplicated data.\n" +
    "Scans the dicomweb/instances directory to find data, then deletes it by default.",
};

// Configure program commander
const program = configureProgram(defaults);
const configuration = adaptProgramOpts(program.opts());

main(configuration, program.args).then(() => {
  console.log("done");
});
