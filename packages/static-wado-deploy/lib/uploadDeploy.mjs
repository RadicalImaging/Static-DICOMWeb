import DeployGroup from "./DeployGroup.mjs";

export default async function uploadMain(storeDirectory, config, name, options, deployPlugin) {
  if (options.rootDir) {
    config.rootDir = options.rootDir;
  }
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  await deployer.loadOps();
  await deployer.store(storeDirectory);
  console.log("Stored", storeDirectory);
}
