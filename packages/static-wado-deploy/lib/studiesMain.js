import DeployGroup from "./DeployGroup.mjs";

export default async function () {
  console.log("Deploy studies", this.deployPlugin);
  const deployer = new DeployGroup(this,"root");
  await deployer.loadOps();
  console.log("Loaded operations");
  await deployer.store();
  console.log("Stored");
}
