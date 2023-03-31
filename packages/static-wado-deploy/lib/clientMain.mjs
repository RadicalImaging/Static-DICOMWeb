import commonMain from "./commonMain.mjs";
import uploadDeploy from "./uploadDeploy.mjs";

export default async function (options) {
  if (options.retrieve) throw new Error("Retrieve unsupported for client files");
  await commonMain(this, "client", options, uploadDeploy.bind(null, undefined));
}
