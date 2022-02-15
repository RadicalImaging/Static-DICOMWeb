#!/usr/bin/env node

const { DcmjsDimseScp, Server } = require("../lib");
const { configureProgram } = require("../lib/program");

const port = 11112;

const defaults = {
  isStudyData: true,
  isGroup: true,
  helpShort: "dicomwebscp",
  helpDescription: "Creates server to receive data on DIMSE and store it DICOM",
};

// Configure program commander
configureProgram(defaults);

console.log(Server);
const server = new Server(DcmjsDimseScp);
server.on("networkError", (e) => {
  console.log("Network error: ", e);
});
console.log(`Starting server listen on port ${port}`);
server.listen(port);
