#!/usr/bin/env node

const { main } = require("../lib");
const { configureProgram } = require("../lib/program");

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
configureProgram(defaults);

main(defaults).then(() => {
  console.log("done");
});
