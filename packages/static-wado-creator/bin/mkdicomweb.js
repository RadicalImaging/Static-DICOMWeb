#!/usr/bin/env node

const { staticWadoConfig } = require("../lib");
const { configureProgram } = require("../lib/program");

const defaults = Object.assign(Object.create(staticWadoConfig), {
  isStudyData: true,
  isGroup: true,
  argumentsRequired: ["input"],
  helpShort: "mkdicomweb",
  helpDescription:
    "Make DICOMweb query and metadata from binary Part 10 DICOM files.  Does a full read of\n" +
    "deduplicated files each time a study instance UID is found, and only updates those studies\n" +
    "having at least one ",
});

// Configure program commander
configureProgram(defaults).then((program) =>
  program.main().then(() => {
    console.log("done");
  })
);
