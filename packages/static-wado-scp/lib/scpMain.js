const dcmjsDimse = require("dcmjs-dimse");
const { Server } = dcmjsDimse;
const DcmjsDimseScp = require("./DcmjsDimseScp");

module.exports = function scpMain(options) {
  const port = options.scpPort || 11112;

  const server = new Server(DcmjsDimseScp);
  server.on("networkError", (e) => {
    console.log("Network error: ", e);
  });
  console.log("Starting server listen on port", port, options);
  DcmjsDimseScp.setParams(options);
  server.listen(port, options);
}

