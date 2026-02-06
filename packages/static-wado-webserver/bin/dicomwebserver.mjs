#!/usr/bin/env bun

import { dicomWebServerConfig, configureProgram } from '../lib/index.mjs';
// import "@radicalimaging/static-wado-plugins";

// Configure program commander
configureProgram(dicomWebServerConfig).then((program) => {
  return program.main();
});
