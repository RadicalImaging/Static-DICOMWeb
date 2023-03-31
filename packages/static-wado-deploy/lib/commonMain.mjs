export default function commonMain(config, name, options, deploymentFunction) {
  const deployPlugin = config.deployPlugin;
  console.log(`Deploy ${name}`, deployPlugin);
  const deployments = config.deployments;
  if (deployments) {
    const deployment = deployments.find(deployment => deployment[`${name}Group`] && options.deployments.includes(deployment.name));
    if ( !deployment ) {
      console.warn("Deployment", options.deployments, "not found containing", name, "Group");
      return -1;
    }
    return deploymentFunction(deployment, name, options, deployPlugin);
  }
  return deploymentFunction(config, name, options, deployPlugin);
}
