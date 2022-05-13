const must = require("must");
const { configDiff, staticWadoConfig } = require("../../lib/index");

describe("configDiff", () => {
  it("returns same object if identical", () => {
    const updated = {
      ...staticWadoConfig,
    };
    const diff = configDiff(updated);
    must(diff).be.undefined();
  });

  it("updates just the changed objects.", () => {
    const updated = {
      ...staticWadoConfig,
      rootDir: "updateRootDir",
      verbose: true,
    };
    const diff = configDiff(updated);
    must(diff.rootDir).eql(updated.rootDir);
    must(diff.verbose).eql(true);
    must(diff.compress).be.undefined();
    must(diff.configBase).be.undefined();
  });
});
