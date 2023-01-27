import commonMain from "./commonMain.mjs";

async function uploadLei(sourcePath, config,name,options, deployer) {
  console.log("Uploading to", sourcePath);
  deployer.store(sourcePath);
}

export default async function (studyUid, options) {
  if( !studyUid ) {
    console.log("requiredParameter missing", studyUid, options);
    return;
  }
  await commonMain(this, "upload", options, uploadLei.bind(null,`lei/${studyUid}`));
}
