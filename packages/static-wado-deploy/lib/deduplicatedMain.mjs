import commonMain from "./commonMain.mjs";
import uploadDeploy from "./uploadDeploy.mjs";
import { retrieveF, retrieveMain } from './retrieveDeploy.mjs';

export default async function (studyUID, options) {
  if (!studyUID) throw new Error("Must provide a studyUID to upload/download");
  const studyDirectory = `deduplicated/${studyUID}`;
  if (options.retrieve) {
    console.log("Retreiving deduplicated files for studyUID", studyUID);
    await retrieveMain(this, "root", options, retrieveF.bind(null, studyDirectory));
  } else {
    console.log("Storing deduplicated files for studyUID", studyUID);
    await commonMain(this, "root", options, uploadDeploy.bind(null, studyDirectory));
  }
}
