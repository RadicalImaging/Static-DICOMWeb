export default function commonMain(config, name, options, storeF) {
  const deployPlugin = config.deployPlugin;
  console.log(`Deploy ${name}`, deployPlugin);
  const deployments = config.deployments;
  //if (deployments) {
  //  return Promise.all(deployments.map((deployment) => {
  //    if (deployment[`${name}Group`] && (!options.deployments || options.deployments.includes(deployment.name))) {
  //      return storeF(deployment, name, options, deployPlugin);
  //    } else {
  //      console.log("skipping deployment", deployment.name);
  //    }
  //  }));
  //} else {
  //  return storeF(config, name, options, deployPlugin);
  //}
}
