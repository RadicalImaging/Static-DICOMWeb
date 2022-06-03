const must = require("must");

const { dicomWebScpConfig } = require("../../lib");

describe("@radical/static-wado-scp", () => {
  it("dicomWebScpConfig", () => {
    must(dicomWebScpConfig).be.not.undefined();
    must(dicomWebScpConfig.staticWadoAe).eql("DICOMWEB");
  });
});
