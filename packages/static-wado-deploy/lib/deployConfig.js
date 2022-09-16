import ConfigPoint from "config-point";
import { staticWadoConfig } from "@radicalimaging/static-wado-util";
import studiesMain from "./studiesMain.js";
import clientMain from "./clientMain.js";
import themeMain from "./themeMain.js";

// Define the generic configuration in the base config
ConfigPoint.extendConfiguration("staticWadoConfig", {
  // Default deployment is s3 - other ones need customizing
  deployPlugin: "s3Plugin",
  deployNotificationName: "deploy",
});

/**
 * Defines the basic configuration values for deploying to the cloud.
 * Set deployPlugin to the name of the deployment plugin if not s3.
 * See the README for more details.
 */
const { deployConfig } = ConfigPoint.register({
  deployConfig: {
    // This declare the inheritted configuration, don't assume this is directly accessible
    configBase: staticWadoConfig,

    options: [
      {
        key: "--dry-run",
        description: "Do a dry run, without actually uploading (but DOES check remote existance if configured)",
        defaultValue: false,
      },
      {
        key: "-d, --deployments <listvalue...>",
        description: "List of deployments from configuration to deploy to. Separated by space.",
        defaultValue: undefined,
      },
      {
        key: "-v, --verbose",
        description: "Write verbose output",
        defaultValue: false,
      },
    ],

    programs: [
      {
        command: "studies",
        helpShort: "deploydicomweb studies {studyUID}",
        helpDescription: "Deploy DICOMweb files to the cloud",
        isDefault: true,
        main: studiesMain,
      },
      {
        command: "client",
        helpShort: "deploydicomweb client",
        helpDescription: "Deploy client files to the cloud",
        main: clientMain,
      },
      {
        command: "theme",
        helpShort: "deploydicomweb theme",
        helpDescription: "Deploy updated theme files to the cloud",
        main: themeMain,
      },

      // {
      //   command: "continuous",
      //   helpShort: "deploydicomweb continuous",
      //   helpDescription: "Deploy DICOMweb files as the notifications arrive, to the Cloud",
      // },
    ],
  },
});

export default deployConfig;
