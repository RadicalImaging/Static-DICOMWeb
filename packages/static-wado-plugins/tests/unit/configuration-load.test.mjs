import must from "must";

import { importPlugin, plugins } from "../../lib/index.js";

describe("@ohif/static-wado-plugins", () => {
  beforeAll(() => importPlugin("readSeriesIndex"));

  it("config has default values", () => {
    must(plugins.readSeriesIndex).not.be.undefined();
  });

  it("readSeriesIndex plugin loads", () => importPlugin("readSeriesIndex"));
});
