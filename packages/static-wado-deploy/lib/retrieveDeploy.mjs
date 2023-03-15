import DeployGroup from "./DeployGroup.mjs";

/** Retrieves from the given deployment, files in retrieveDirectory */
export default async function retrieveDeploy(retrieveDirectory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  await deployer.loadOps();
  console.log("retrieve from", retrieveDirectory);
  await deployer.retrieve(options, retrieveDirectory);
}
