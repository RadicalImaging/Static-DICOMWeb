import commonMain from "./commonMain.mjs";
import uploadDeploy from "./uploadDeploy.mjs";
import uploadIndex from "./uploadIndex.mjs";

export default async function (studyUID, options) {
  console.log("studyUID=", studyUID);
  const studyDirectory = studyUID ? `studies/${studyUID}` : "studies";
  await commonMain(this, "root", options, uploadDeploy.bind(null, studyDirectory));
  if( options.index ) {
    console.log("Calling commonMain to create index");
    await commonMain(this, "root", options, uploadIndex.bind(null,studyDirectory));
  } else {
    console.log("NOT Calling commonMain to create index");
  }
}
