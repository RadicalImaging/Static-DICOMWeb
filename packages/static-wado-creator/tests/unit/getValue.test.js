const must = require("must");
const getValue = require("../../lib/operation/getValue");

const dataSet = {};
const UN = "UN";

describe("getValue", () => {
  it("gets undefined for grouplength", async () => {
    must(await getValue(dataSet, { tag: "x00090000", Value: [1] }, UN)).be.undefined();
  });

  it("gets undefined for item end", async () => {
    must(await getValue(dataSet, { tag: "xfffee00d", Value: [1] }, UN)).be.undefined();
  });
});
