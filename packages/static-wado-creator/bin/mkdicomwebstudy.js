#!/usr/bin/env node

const { main } = require("../lib");
const { configureProgram } = require("../lib/program");

const defaults = {
  isStudyData: true,
  scanStudies: "deduplicatedRoot",
  helpShort: "mkdicomwebstudy",
  helpLong:
    "Scans the deduplicated directory for studies, and generates the study metadata.\n" +
    "No updates are performed on any study where the deduplicated hash value is identical to the\n" +
    "hash value of the latest deduplicated file.",
};

// Configure program commander
configureProgram(defaults);

main(defaults).then(() => {
  console.log("done");
});
