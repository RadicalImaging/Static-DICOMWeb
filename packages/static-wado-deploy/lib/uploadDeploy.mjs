import DeployGroup from "./DeployGroup.mjs";

export default async function uploadMain(storeDirectory, config, name, options, deployPlugin) {
  if (options.rootDir) {
    config.rootDir = options.rootDir;
  }
  if (options.s3RgBucket) {
    config.rootGroup.Bucket = options.s3RgBucket;
  }
  if (options.customerGroup && options.customerName) {
    config.rootGroup.path = `/${options.customerGroup}/${options.customerName}${config.rootGroup.path}`;
  }
  if(!config.s3Env){
    config.s3Env = {};
  }
  if (options.s3EnvAccount) {
    config.s3Env.account = options.s3EnvAccount;
  }
  if (options.s3EnvRegion) {
    config.s3Env.region = options.s3EnvRegion;
  }
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  await deployer.loadOps();
  await deployer.store(storeDirectory);
  console.log("Stored", storeDirectory);
}
