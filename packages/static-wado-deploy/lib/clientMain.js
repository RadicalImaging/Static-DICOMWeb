import DeployGroup from "./DeployGroup.mjs";

export default async function (options) {
  console.log("Deploy studies", this.deployPlugin);
  const deployer = new DeployGroup(this, "client", options);
  await deployer.loadOps();
  await deployer.store();
}
