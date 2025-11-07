import commonMain from "./commonMain.mjs";
import uploadDeploy from "./uploadDeploy.mjs";
import uploadIndex from "./uploadIndex.mjs";
import retrieveDeploy from "./retrieveDeploy.mjs";

export default async function (studyUID, options) {
  const studyDirectory = studyUID ? `studies/${studyUID}` : "studies";
  if (options.retrieve) {
    console.log("Retrieve studyUID", studyUID);
    await commonMain(this, "root", options, retrieveDeploy.bind(null, studyDirectory));

    return;
  }

  if (!options.skipStore) {
    console.log('Storing studyUID', studyUID);
    await commonMain(
      this,
      'root',
      options,
      uploadDeploy.bind(null, studyDirectory)
    );
  }
  if (options.index) {
    console.log("Calling commonMain to create index");
    await commonMain(this, "root", options, uploadIndex.bind(null, studyDirectory));
  } else {
    console.log("NOT Calling commonMain to create index");
  }
}
