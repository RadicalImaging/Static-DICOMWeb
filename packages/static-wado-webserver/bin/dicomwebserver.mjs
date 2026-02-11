#!/usr/bin/env bun

import {
  dicomWebServerConfig,
  configureProgram,
} from "@radicalimaging/static-wado-webserver";
// import "@radicalimaging/static-wado-plugins";

// Configure program commander
configureProgram(dicomWebServerConfig).then(async (program) => {
  if (program.dicomWebServerConfig.index) {
    const { indexMain } = await import('@radicalimaging/create-dicomweb');
    console.log('Running study indexing...');
    await indexMain([], { dicomdir: program.dicomWebServerConfig.rootDir });
  }
  return program.main();
});
