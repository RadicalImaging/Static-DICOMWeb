import commonMain from "./commonMain.mjs";
import uploadDeploy from "./uploadDeploy.mjs";
import uploadIndex from "./uploadIndex.mjs";
import retrieveDeploy from "./retrieveDeploy.mjs";

export default async function (options, program) {
  const { args: studies } = program;
  if (!studies?.length) {
    return;
  }

  if (studies.length === 1 && studies[0] === "*") {
    return studyMainSingle.call(this, "", options);
  }
  for (const studyUID of studies) {
    await studyMainSingle.call(this, studyUID, options);
  }
}

export async function studyMainSingle(studyUID, options) {
  console.warn("Uploading study", studyUID);
  const studyDirectory = studyUID ? `studies/${studyUID}` : "studies";
  if (options.retrieve) {
    console.log("Retrieve studyUID", studyUID);
    await commonMain(
      this,
      "root",
      options,
      retrieveDeploy.bind(null, studyDirectory)
    );

    return;
  }

  if (!options.skipStore) {
    await commonMain(
      this,
      "root",
      options,
      uploadDeploy.bind(null, studyDirectory)
    );
    console.log("Storing studyUID", studyUID);
    await commonMain(
      this,
      "root",
      options,
      uploadDeploy.bind(null, studyDirectory)
    );
  }
  if (options.index) {
    console.log("Calling commonMain to create index");
    await commonMain(
      this,
      "root",
      options,
      uploadIndex.bind(null, studyDirectory)
    );
  } else {
    console.log("NOT Calling commonMain to create index");
  }
}
