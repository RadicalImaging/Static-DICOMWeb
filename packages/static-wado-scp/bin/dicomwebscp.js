#!/usr/bin/env node

const { dicomWebScpConfig } = require("../lib");
const { configureProgram } = require("../lib/program");

const defaults = Object.create(dicomWebScpConfig);

// Configure program commander
configureProgram(defaults).then((program) => program.main());
