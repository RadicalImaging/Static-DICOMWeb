import ConfigPoint from "config-point";
import { staticWadoConfig } from "@ohif/static-wado-util";
import s3Ops from "./S3Ops.mjs";

const { awsConfig, awsHandlers } = ConfigPoint.register({
  awsConfig: {
    configBase: staticWadoConfig,
    cloudfront: {

    },
    authentication: "~/aws-ohif.json",
    region: "us-east-2",

    helpShort: "mkdicomwebdeploy",
    helpDescription:
      "Make DICOMweb deployment to AWS",
  },

  awsHandlers: {
     dicomweb: s3Ops,
     client: s3Ops,
     default: s3Ops,
  },
})

export default awsConfig;

export { awsConfig, awsHandlers };