#!/usr/bin/env node

import DicomWebServer, { dicomWebServerConfig } from "../lib/index.mjs";

import configureProgram from "../lib/program/index.mjs";

// Dynamically include the required imports
const defaults = Object.create(dicomWebServerConfig);

import("../lib/studyQueryReadIndex.mjs").then(() => {
  // Configure program commander
  configureProgram(defaults);

  const app = DicomWebServer(defaults);
  app.listen();
});
