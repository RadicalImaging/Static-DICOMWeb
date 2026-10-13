#!/usr/bin/env bun

import { dicomWebScpConfig, configureProgram } from "../lib/index.mjs";

// Configure program commander
configureProgram(dicomWebScpConfig).then(() => {
  console.verbose("done");
});
