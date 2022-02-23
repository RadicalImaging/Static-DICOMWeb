const must = require("must");

const { dicomWebScpConfig } = require("../../lib");

describe("@ohif/static-wado-scp", () => {
  it("dicomWebScpConfig", () => {
    must(dicomWebScpConfig).be.not.undefined();
    must(dicomWebScpConfig.scpPort).eql(11112);
    must(dicomWebScpConfig.scpAe).eql("DICOMWEB");
  });
});
