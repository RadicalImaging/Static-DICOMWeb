import commonMain from "./commonMain.mjs";
import uploadDeploy from "./uploadDeploy.mjs";

export default async function (options) {
  await commonMain(this, "client", options, uploadDeploy.bind(null, undefined));
}
