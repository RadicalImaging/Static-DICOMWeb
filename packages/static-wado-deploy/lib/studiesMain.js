import DeployGroup from "./DeployGroup.mjs";

export default async function (options) {
  console.log("Deploy studies", this.deployPlugin);
  const deployer = new DeployGroup(this, "root", options);
  await deployer.loadOps();
  console.log("Loaded operations");
  await deployer.store("studies");
  console.log("Stored");
}
