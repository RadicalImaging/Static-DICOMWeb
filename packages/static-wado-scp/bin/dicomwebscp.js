#!/usr/bin/env node

const { dicomWebScpConfig, configureProgram } = require("../lib");

// Configure program commander
configureProgram(dicomWebScpConfig).then(() => {
  console.verbose("done");
});
