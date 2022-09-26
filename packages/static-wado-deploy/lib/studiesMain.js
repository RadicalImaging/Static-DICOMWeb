import commonMain from "./commonMain.mjs";

export default async function (studyUID, options) {
  console.log("studyUID=", studyUID);
  const studyDirectory = studyUID ? `studies/${studyUID}` : 'studies';
  await commonMain(this, "root", options, studyDirectory);
}
