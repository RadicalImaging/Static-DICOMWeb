import ConfigPoint from "config-point";
import { staticWadoConfig } from "@radicalimaging/static-wado-util";
import studiesMain from "./studiesMain.mjs";
import clientMain from "./clientMain.mjs";
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
        key: "-rd, --root-dir <rootDir>",
        description: "Root directory of static wado",
        defaultValue: "~/dicomweb",
      },
      {
        key: "-v, --verbose",
        description: "Write verbose output",
        defaultValue: false,
      },
      {
        key: "-s3cd, --s3-client-dir <s3ClientDir>",
        description: "S3 client directory of static wado",
        defaultValue: "~/ohif",
      },
      {
        key: "-s3rgb, --s3-rg-bucket <s3RootGroupBucket>",
        description: "S3 root group bucket of static wado",
      },
      {
        key: "-s3cgb, --s3-cg-bucket <s3ClientGroupBucket>",
        description: "S3 client group bucket of static wado",
      },
      {
        key: "-s3ea, --s3-env-account <s3EnvAccount>",
        description: "S3 account environment of static wado",
      },
      {
        key: "-s3er, --s3-env-region <s3EnvRegion>",
        description: "S3 region environment of static wado",
      },
    ],

    programs: [
      {
        command: "studies [studyUID]",
        arguments: ["studyUID"],
        helpShort: "deploydicomweb studies [studyUID]",
        helpDescription: "Deploy DICOMweb files to the cloud",
        options: [
          {
            key: "--no-index",
            description: "Don't create or update the index files",
            defaultValue: true,
          },
        ],
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
