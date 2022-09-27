#!/usr/bin/env node

const { dicomWebScpConfig } = require("../lib");
const { configureProgram } = require("../lib/program");

// Configure program commander
configureProgram(dicomWebScpConfig).then((program) => program.main());
