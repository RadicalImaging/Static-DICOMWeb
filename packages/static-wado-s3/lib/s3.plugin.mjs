import ConfigPoint from "config-point";
import s3Ops from "./S3Ops.mjs";

const s3Plugin = ConfigPoint.createConfiguration("s3Plugin", {
  createPlugin: s3Ops,
});

export default s3Plugin;
