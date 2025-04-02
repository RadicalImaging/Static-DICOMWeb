#!/usr/bin/env node

const {
  dicomWebScpConfig,
  configureProgram,
} = require("@radicalimaging/static-wado-scp");

// Configure program commander
configureProgram(dicomWebScpConfig).then(() => {
  console.verbose("done");
});
