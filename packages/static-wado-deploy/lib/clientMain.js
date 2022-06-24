import commonMain from "./commonMain.mjs";

export default async function (options) {
  await commonMain(this, "client", options);
}
