#!/usr/bin/env bun

import {
  dicomWebServerConfig,
  configureProgram,
} from "@radicalimaging/static-wado-webserver"
// import "@radicalimaging/static-wado-plugins";

// Configure program commander
configureProgram(dicomWebServerConfig).then((program) => {
  program.main()
})
