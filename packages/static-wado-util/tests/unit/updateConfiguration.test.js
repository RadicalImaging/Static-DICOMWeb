const must = require("must");
const fs = require("fs");
const json5 = require("json5");
const { updateConfiguration, staticWadoConfig } = require("../../lib/index");

const readConfiguration = (filename) => {
  const contents = fs.readFileSync(filename);
  return json5.parse(contents);
};

const configName = "./test-configuration.json5";

describe("updateConfiguration", () => {
  it("updates just the changed objects.", () => {
    if (fs.existsSync(configName)) fs.unlinkSync(configName);
    const updated = {
      ...staticWadoConfig,
      compress: false,
      rootDir: "updateRootDir",
    };
    updateConfiguration(configName, updated);
    const { staticWadoConfig: config1 } = readConfiguration(configName);

    must(config1.rootDir).eql(updated.rootDir);
    must(config1.compress).eql(false);

    const updated2 = {
      ...staticWadoConfig,
      ...config1,
      verbose: true,
      compress: true,
      rootDir: "update2",
      rootGroup: {
        Bucket: "bucket",
      },
    };
    updateConfiguration(configName, updated2);
    const { staticWadoConfig: config2 } = readConfiguration(configName);
    must(config2.rootGroup.Bucket).eql("bucket");
    must(config2.compress).be.undefined();
    must(config2.verbose).eql(true);
    must(config2.rootDir).eql(updated2.rootDir);
  });
});
