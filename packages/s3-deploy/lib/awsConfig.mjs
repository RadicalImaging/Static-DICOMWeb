import ConfigPoint from "config-point";
import { staticWadoConfig } from "@ohif/static-wado-util";
import S3Ops from "./S3Ops.mjs";

const { awsConfig, awsHandlers } = ConfigPoint.register({
  awsConfig: {
    configBase: staticWadoConfig,
    cloudfront: {},
    authentication: "~/aws-ohif.json",
    region: "us-east-2",

    helpShort: "mkdicomwebdeploy",
    helpDescription: "Make DICOMweb deployment to AWS",
  },

  awsHandlers: {
    dicomweb: S3Ops,
    client: S3Ops,
    default: S3Ops,
  },
});

export default awsConfig;

export { awsConfig, awsHandlers };
