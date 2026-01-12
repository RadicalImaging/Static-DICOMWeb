import must from "must";

import { plugins } from '../../lib/index.mjs';

describe("@radicalimaging/static-wado-plugins", () => {
  beforeAll(() => import(plugins.readSeriesIndex));

  it("config has default values", () => {
    must(plugins.readSeriesIndex).not.be.undefined();
  });

  it("readSeriesIndex plugin loads", () => import(plugins.readSeriesIndex));
});
