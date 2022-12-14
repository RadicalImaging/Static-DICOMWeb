import must from "must";
import { DeployStaticWado } from "../../lib/index.mjs";
import { testDeploy, resetDeployers } from "../../mocks/MockPlugin.mjs";

describe("deploy", () => {
  beforeEach(() => {
    resetDeployers();
  });

  it("configures", async () => {
    must(DeployStaticWado).not.be.undefined();
    const deployer = new DeployStaticWado(testDeploy);
    const loaded = await deployer.loadPlugins();
    must(deployer.clientDeploy).not.be.undefined();
    must(deployer.rootDeploy).not.be.undefined();
    loaded.client.must.not.be.undefined();
    loaded.root.must.not.be.undefined();
  });
});
