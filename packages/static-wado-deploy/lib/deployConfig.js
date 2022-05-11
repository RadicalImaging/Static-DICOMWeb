import ConfigPoint from "config-point";
import { staticWadoConfig } from "@ohif/static-wado-util";

/**
 * Defines the basic configuration values for deploying to the cloud.
 * Set deployPlugin to the name of the deployment plugin if not s3.
 * See the README for more details.
 */
const { deployConfig } = ConfigPoint.register({
  deployConfig: {
    // This declare the inheritted configuration, don't assume this is directly accessible
    configBase: staticWadoConfig,

    // Default deployment is s3 - other ones need customizing
    deployPlugin: "s3",
    deployNotificationName: "deploy",

    programs: [
      {
        command: "studies",
        helpShort: "deploydicomweb studies {studyUID}",
        helpDescription: "Deploy DICOMweb files to the cloud",
      },
      {
        command: "client",
        argument: ["<string>", "Study UID to deploy"],
        helpShort: "deploydicomweb client",
        helpDescription: "Deploy client files to the cloud",
      },
      {
        command: "continuous",
        helpShort: "deploydicomweb continuous",
        helpDescription: "Deploy DICOMweb files as the notifications arrive, to the Cloud",
      },
    ],
  },
});

export default deployConfig;
