#!/usr/bin/env node

const { mkdicomwebConfig } = require("../lib");
const { configureProgram } = require("../lib/program");

// Configure program commander
configureProgram(mkdicomwebConfig).then(() => {
  console.verbose("done");
});
