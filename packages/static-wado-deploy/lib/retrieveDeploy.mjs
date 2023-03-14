import DeployGroup from "./DeployGroup.mjs";

export async function retrieveF(retrieveDirectory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  await deployer.loadOps();
  console.log("retrieve from", retrieveDirectory);
  await deployer.retrieve(options, retrieveDirectory);
}

export function retrieveMain(config, name, options, retrieveF) {
  const deployPlugin = config.deployPlugin;
  console.log(`Retrieve ${name}`, deployPlugin, options);
  const deployments = config.deployments;
  if (deployments) {
    return Promise.all(deployments.map((deployment) => {
      if (deployment[`${name}Group`] && (!options.deployments || options.deployments.includes(deployment.name))) {
        return retrieveF(deployment, name, options, deployPlugin);
      }
    }));
  } else {
    return retrieveF(config, name, options, deployPlugin);
  }
}
