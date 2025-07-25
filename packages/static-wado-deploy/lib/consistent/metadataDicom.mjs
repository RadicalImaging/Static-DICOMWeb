import { execFileSync } from "node:child_process";

import DeployGroup from "../DeployGroup.mjs";

export default async function metadataDicom(
  config,
  deployment,
  studyUID,
  options
) {
  const deployer = new DeployGroup(
    deployment,
    "root",
    options,
    config.deployPlugin
  );

  const directory = `${deployer.baseDir}${deployer.group.path}/${studyUID}`;

  // Todo - add deployment to mkdicomweb
  const args = ["mkdicomweb", "metadata", studyUID];
  if (options.notifications === false) {
    args.push("--no-notifications");
  }

  execFileSync(args.join(" "), { shell: true, stdio: "inherit" });
}
