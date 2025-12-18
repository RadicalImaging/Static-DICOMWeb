export default function commonMain(config, name, options, storeF) {
  const deployPlugin = config.deployPlugin;
  console.log(`Deploy ${name}`, deployPlugin);
  const deployments = config.deployments;
  if (deployments) {
    return Promise.all(
      deployments.map(deployment => {
        if (
          deployment[`${name}Group`] &&
          (!options.deployments || options.deployments.includes(deployment.name))
        ) {
          return storeF(deployment, name, options, deployPlugin);
        }
        console.log('skipping deployment', deployment.name);
        return null;
      })
    );
  }
  return storeF(config, name, options, deployPlugin);
}
