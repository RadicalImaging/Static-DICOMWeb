import DeployGroup from "./DeployGroup.mjs";

async function doDeploy(config, name, options, deployPlugin, storeOption) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  await deployer.loadOps();
  console.log("Loaded operations");
  await deployer.store(storeOption);
  console.log("Stored", storeOption);
}

export default async function commonMain(config, name, options, storeOption) {
  const deployPlugin = config.deployPlugin;
  console.log(`Deploy ${name}`, deployPlugin);
  const deployments = config.deployments;
  if (deployments) {
    deployments.forEach(async (deployment) => {
      if (deployment[`${name}Group`] && (!options.deployments || options.deployments.includes(deployment.name))) {
        await doDeploy(deployment, name, options, deployPlugin, storeOption);
      } else {
        await console.log("skipping deployment", deployment.name);
      }
    });
  } else {
    doDeploy(config, name, options, deployPlugin, storeOption);
  }
}
