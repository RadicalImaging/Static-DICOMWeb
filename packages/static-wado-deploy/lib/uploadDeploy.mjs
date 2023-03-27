import DeployGroup from "./DeployGroup.mjs";

export default async function uploadMain(storeDirectory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  await deployer.loadOps();
  console.log("uploadDeploy from", storeDirectory);
  const count = await deployer.store(storeDirectory);
  console.log("Uploaded", count, "files");
  return count;
}
