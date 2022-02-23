const assert = require("must");
const fs = require("fs");
const StaticWado = require("../lib");

const { staticWadoConfig } = StaticWado;

/* eslint no-unused-expressions: 0 */

describe("index", async () => {
  let dicomp10stream;

  const importer = new StaticWado({
    isStudyData: true,
    isGroup: true,
  });

  beforeEach(async () => {
    dicomp10stream = fs.createReadStream("../../testdata/dcm/MisterMr/1.2.840.113619.2.5.1762583153.215519.978957063.101");
  });

  it("exports", async () => {
    assert(importer).must.not.be.undefined();
    assert(dicomp10stream.length).must.not.be.undefined();
  });

  describe("staticWadoConfig", () => {
    it("has basic config", () => {
      assert(staticWadoConfig).must.not.be.null();
      assert(staticWadoConfig.rootDir).must.eql("~/dicomweb");
    });
  });
});
