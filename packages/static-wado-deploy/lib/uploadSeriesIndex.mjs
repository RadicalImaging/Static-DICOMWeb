import DeployGroup from "./DeployGroup.mjs";

/**
 * Reads the storeDirectory to get the index file, and adds that to the index directory
 *
 */
export default async function uploadSeriesIndex(storeDirectory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  const { group } = deployer;
  const indexFullName = `${storeDirectory}/${group.index}.json.gz`;
  await deployer.loadOps();
  await deployer.store(indexFullName);
}
