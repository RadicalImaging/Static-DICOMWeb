import must from "must";
import awsConfig from "../../lib/index.mjs";

describe("S3Deploy", () => {
  it("configures", () => {
    must(awsConfig).not.be.undefined();
  });
});
