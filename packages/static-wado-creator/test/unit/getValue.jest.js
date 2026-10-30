const must = require("must");
const getValue = require("../../lib/operation/getValue");

const dataSet = {};
const UN = "UN";

describe("getValue", () => {
  it("gets undefined for grouplength", async () => {
    must(
      await getValue(dataSet, { tag: "x00090000", Value: [1] }, UN),
    ).be.undefined();
  });

  it("gets undefined for item end", async () => {
    must(
      await getValue(dataSet, { tag: "xfffee00d", Value: [1] }, UN),
    ).be.undefined();
  });

  it("decodes a UTF-8 patient name", async () => {
    // dicom-parser returns one character per byte; ISO_IR 192 says the bytes are UTF-8
    const name = Buffer.from("試験^患者\\見本^次郎", "utf8").toString("latin1");
    const options = { SpecificCharacterSet: "ISO_IR 192", maximumInlinePublicLength: 128 };
    must(
      await getValue(
        { string: () => name },
        { tag: "x00100010", length: name.length },
        "PN",
        undefined,
        undefined,
        options,
      ),
    ).eql([{ Alphabetic: "試験^患者" }, { Alphabetic: "見本^次郎" }]);
  });
});
