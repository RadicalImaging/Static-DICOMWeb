import must from "must";

import ConfigPoint from "config-point";
import { loadConfiguration } from "@ohif/static-wado-util";
import { dicomWebServerConfig, importPlugin } from "../../lib/index.mjs";

import "regenerator-runtime";

describe("@ohif/static-wado-webserver", () => {
  beforeAll(() => importPlugin("readSeriesIndex"));

  const params = { rootDir: ".." };

  it("has default values", () => {
    must(ConfigPoint.getConfig(dicomWebServerConfig)).not.be.undefined();
    must(ConfigPoint.getConfig("readSeriesIndex")).not.be.undefined();
  });

  it("loaded readSeriesIndex", async () => {
    const { generator } = await importPlugin("readSeriesIndex");
    const readSeriesIndex = generator(params);
    must(readSeriesIndex).be.function();
  });

  it("loaded studiesQueryByIndex", async () => {
    const { generator } = await importPlugin("studiesQueryByIndex");
    const queryFunction = generator(params);
    must(queryFunction).be.function();
  });

  it("loads program files", async () => {
    const defaults = Object.create(dicomWebServerConfig);
    defaults.configurationFile = ["~/notFound.json5", "tests/static-wado.json5"];
    must(defaults.port).eql(5000);
    await loadConfiguration(defaults, []);
    must(defaults.port).eql(5001);
    must(defaults.rootDir).eql("../../../../tmp/dicomweb");
  });
});
