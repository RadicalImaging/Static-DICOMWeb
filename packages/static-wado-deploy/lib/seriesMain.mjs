import commonMain from "./commonMain.mjs";
import uploadDeploy from "./uploadDeploy.mjs";
import uploadSeriesIndex from "./uploadSeriesIndex.mjs";

export default async function (studyUID, seriesUID, options) {
  console.log("studyUID=", studyUID);
  console.log("seriesUID=", seriesUID);

  const studySeriesDirectory = studyUID && seriesUID ? `studies/${studyUID}/series/${seriesUID}` : "studies";
  const studySeriesIndexDirectory = studyUID && seriesUID ? `studies/${studyUID}/series` : "studies";

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
    await commonMain(this, "root", options, uploadDeploy.bind(null, studySeriesDirectory));
  }
  if (options.index) {
    console.log("Calling commonMain to upload series Index");
    await commonMain(this, "root", options, uploadSeriesIndex.bind(null, studySeriesIndexDirectory));
  } else {
    console.log("Not calling commonMain to not upload series Index");
  }
}
