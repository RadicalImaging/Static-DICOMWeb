import commonMain from "./commonMain.mjs";
import uploadDeploy from "./uploadDeploy.mjs";
import uploadIndex from "./uploadIndex.mjs";

export default async function (studyUID, options) {
  console.log("studyUID=", studyUID);
  const studyDirectory = studyUID ? `studies/${studyUID}` : "studies";

  if (options.rootDir) {
    this.rootDir = options.rootDir;
  }
  if (options.s3RgBucket) {
    this.rootGroup.Bucket = options.s3RgBucket;
    this.rootGroup.region = options.s3EnvRegion;
  }
  if (options.customerGroup && options.customerName) {
    this.rootGroup.path = `/${options.customerGroup}/${options.customerName}${this.rootGroup.path}`;
  }
  if (!this.s3Env) {
    this.s3Env = {};
  }
  if (options.s3EnvAccount) {
    this.s3Env.account = options.s3EnvAccount;
  }
  if (options.s3EnvRegion) {
    this.s3Env.region = options.s3EnvRegion;
  }

  if (!options.indexonly) {
    await commonMain(this, "root", options, uploadDeploy.bind(null, studyDirectory));
  }
  if (options.index) {
    console.log("Calling commonMain to create index");
    await commonMain(this, "root", options, uploadIndex.bind(null, studyDirectory));
  } else {
    console.log("NOT Calling commonMain to create index");
  }
}
