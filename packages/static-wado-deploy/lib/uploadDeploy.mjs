import DeployGroup from "./DeployGroup.mjs";

export default async function uploadMain(directory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  const { excludeDirectory } = options;
  await deployer.loadOps();
  
  console.log("uploadDeploy from", directory);

  const contents = await deployer.dir(directory);

  const count = await deployer.store(directory, "", contents);
  console.log("Uploaded", count, "files");
  return count;
}
