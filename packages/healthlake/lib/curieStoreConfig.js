import ConfigPoint from "config-point";
import { staticWadoConfig } from "@radicalimaging/static-wado-util";
import uploadMain from "./uploadMain.js";
import convertCurieMain from "./convertCurieMain.js";
import leiMain from "./leiMain.js";
import downloadCurieJobMain from "./downloadCurieJobMain.js"
import indexCurieMain from "./indexCurieMain.js";


/**
 * Defines the basic configuration values for deploying to the cloud.
 * Set deployPlugin to the name of the deployment plugin if not s3.
 * See the README for more details.
 */
const { curieStoreConfig } = ConfigPoint.register({
  curieStoreConfig: {
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
        key: "-n, --name <name>",
        description: "Specify the name of the output.",
      },
    ],

    programs: [
      {
        command: "lei <dicomFiles>",
        arguments: ["input"],
        helpShort: "curiestore lei {dicomFiles}",
        helpDescription: "Convert DICOM files to LEI, in preparation for upload",
        isDefault: true,
        main: leiMain,
      },
      {
        command: "upload <name>",
        arguments: ["input"],
        helpShort: "curiestore upload",
        helpDescription: "Upload LEI converted studyUID to S3",
        main: uploadMain,
      },
      {
        command: "convert <input>",
        arguments: ["input"],
        helpShort: "curiestore convert {studyUID}",
        helpDescription: "Convert the curie stored data",
        main: convertCurieMain,
        options: [
          {
            key: "-j, --jobName <jobName>",
            description: "Sets the job name",
          },
        ],
      },
      {
        command: "download <input>",
        helpShort: "curiestore download {jobName/ID}",
        helpDescription: "Download the given jobID results into <dicomDir>/studies/<studyUID>/...",
        main: downloadCurieJobMain,
      },

      {
        command: "index",
        helpShort: "curiestore index {jobName/ID}",
        helpDescription: "Create an index of the locally downloaded data",
        main: indexCurieMain,
      },


      // {
      //   command: "continuous",
      //   helpShort: "deploydicomweb continuous",
      //   helpDescription: "Deploy DICOMweb files as the notifications arrive, to the Cloud",
      // },
    ],
  },
});

export default curieStoreConfig;
