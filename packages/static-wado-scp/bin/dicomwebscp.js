#!/usr/bin/env node

const { DcmjsDimseScp, Server, dicomWebScpConfig } = require("../lib");
const { configureProgram } = require("../lib/program");

const defaults = Object.create(dicomWebScpConfig);

// Configure program commander
configureProgram(defaults)
  .loadConfiguration()
  .then(() => {
    const port = defaults.scpPort || 11112;

    const server = new Server(DcmjsDimseScp);
    server.on("networkError", (e) => {
      console.log("Network error: ", e);
    });
    console.log(`Starting server listen on port ${port}`);
    server.listen(port);
  });
