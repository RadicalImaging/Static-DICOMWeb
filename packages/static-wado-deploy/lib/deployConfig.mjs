import ConfigPoint from "config-point";
import { staticWadoConfig } from "@radicalimaging/static-wado-util";
import studiesMain from "./studiesMain.mjs";
import clientMain from "./clientMain.mjs";
import deduplicatedMain from "./deduplicatedMain.mjs";
import themeMain from "./themeMain.js";
import updateConsistency from "./updateConsistencyMain.mjs";

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
      {
        key: "-r, --retrieve",
        description: "Retrieve the files instead of storing",
        defaultValue: false,
      },
      {
        key: "--retries <retries>",
        description: "Set how many retries before failing",
        defaultValue: 25,
      },
      {
        key: "--delay <delay>",
        description: "Set the delay between retries",
        defaultValue: 5000,
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
        command: "deduplicated <studyUID>",
        helpShort: "Store deduplicated files",
        helpDescription: "Stores the deduplicated files, allowing for later study updates",
        main: deduplicatedMain,
      },
      {
        command: "update <studyUID>",
        helpShort: "Update the studyUID in the cloud compared to local",
        helpDescription: "Stores files from the imported/<studyUID> directory and upload them, making them eventually consistent",
        main: updateConsistency,
      },
      {
        command: "theme",
        helpShort: "deploydicomweb theme",
        helpDescription: "Deploy updated theme files to the cloud",
        main: themeMain,
      },
    ],
  },
});

export default deployConfig;
