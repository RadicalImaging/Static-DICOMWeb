import commonMain from "./commonMain.mjs";
// import uploadDeploy from "./uploadDeploy.mjs";
import compressUploadDeploy from "./compressUploadDeploy.mjs";

export default async function clientMain(options) {
  if (options.retrieve) throw new Error("Retrieve unsupported for client files");
  await commonMain(this, "client", options, compressUploadDeploy.bind(null, ""));
}
