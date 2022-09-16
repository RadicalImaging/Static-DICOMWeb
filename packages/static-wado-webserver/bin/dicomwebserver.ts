#!/usr/bin/env node

import pkg from "@radicalimaging/static-wado-webserver";
import "@radicalimaging/static-wado-plugins";

const { dicomWebServerConfig, configureProgram } = pkg;

// Configure program commander
configureProgram(dicomWebServerConfig).then((program) => {
  program.main();
});
