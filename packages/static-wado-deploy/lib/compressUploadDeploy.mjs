import { execFileSync } from "node:child_process";
import { sleep } from "@radicalimaging/static-wado-util";

import DeployGroup from "./DeployGroup.mjs";
import uploadDeploy from './uploadDeploy.mjs';

export default async function compressUploadDeploy(directory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);

  const args = ["gzip", "-9", "-r", `"${deployer.baseDir}"`];

  console.log("Waiting to compress", name, "directory", deployer.baseDir, directory);
  execFileSync(args.join(" "), { shell: true, stdio: "inherit" });
  // execFileSync(`dir ${deployer.baseDir}`, { shell: true, stdio: "inherit" });
  console.log("Uploading compressed client", deployer.baseDir, directory);
  await uploadDeploy(directory, config, name, options, deployPlugin);

  // Shouldn't be needed, but...
  await sleep(5000);
  args[1] = "-d";
  execFileSync(args.join(" "), { shell: true, stdio: "inherit" });

}
