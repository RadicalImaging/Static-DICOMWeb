#!/usr/bin/env node

const { main } = require("../lib");
const { configureProgram } = require("../lib/program");

const defaults = {
  isStudyData: false,
  isGroup: false,
  isDeduplicate: true,
  argumentsRequired: ["input"],
  helpShort: "mkdicomwebdeduplicated",
  helpDescription: "Makes deduplicated instance level files from a set of DICOM part 10 files.\nDoes not write sets of deduplicated files by default.",
};
// Configure program commander
configureProgram(defaults);

main(defaults).then(() => {
  console.log("done");
});
