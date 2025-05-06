import { DeployGroup } from "@radicalimaging/static-wado-deploy";

async function doDeploy(config, name, options, deployPlugin, storeFunction) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  await deployer.loadOps();
  await storeFunction(config, name, options, deployer);
  console.noQuiet("Stored", name);
}

export default async function commonMain(config, name, options, storeFunction) {
  const deployPlugin = config.deployPlugin;
  const deployments = config.deployments;
  if (deployments) {
    deployments.forEach((deployment) => {
      if (
        deployment[`${name}Group`] &&
        (!options.deployments || options.deployments.includes(deployment.name))
      ) {
        // TODO - wait for this in an overall promise
        doDeploy(deployment, name, options, deployPlugin, storeFunction);
      } else {
        console.noQuiet("skipping deployment", deployment.name);
      }
    });
  } else {
    doDeploy(config, name, options, deployPlugin, storeFunction);
  }
}
