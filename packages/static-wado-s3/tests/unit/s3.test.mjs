import must from "must";
import S3Deploy from "../../lib/index.mjs";

describe("S3Deploy", () => {
  it("configures", () => {
    const testGroup = {
      s3BucketName: "bucket",
    };
    const config = {
      testGroup,
    };

    const s3 = new S3Deploy(config, testGroup);
    must(s3).not.be.undefined();
  });
});
