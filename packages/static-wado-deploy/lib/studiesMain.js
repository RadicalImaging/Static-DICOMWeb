import commonMain from "./commonMain.mjs";

export default async function (options) {
  await commonMain(this, "root", options, "studies");
}
