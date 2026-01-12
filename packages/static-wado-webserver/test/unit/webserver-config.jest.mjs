import must from "must";

import ConfigPoint from "config-point";
import { loadConfiguration } from "@radicalimaging/static-wado-util";
import { plugins } from "@radicalimaging/static-wado-plugins";
import { dicomWebServerConfig } from "../../lib/index.mjs";

import "regenerator-runtime";

describe("@radicalimaging/static-wado-webserver", () => {
  beforeAll(() => import(plugins.readSeriesIndex));

  const params = { rootDir: ".." };

  it("has default values", () => {
    must(ConfigPoint.getConfig(dicomWebServerConfig)).not.be.undefined();
    must(ConfigPoint.getConfig("readSeriesIndex")).not.be.undefined();
  });

  it("loaded readSeriesIndex", async () => {
    const imported = await import(plugins.readSeriesIndex);
    const { generator } = imported.default || imported;
    const readSeriesIndex = generator(params);
    must(readSeriesIndex).be.function();
  });

  it("loaded studiesQueryByIndex", async () => {
    const { generator } = await import(plugins.studiesQueryByIndex);
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
