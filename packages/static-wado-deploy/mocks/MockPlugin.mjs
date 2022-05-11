import ConfigPoint from "config-point";
import { deployConfig } from "../lib/index.mjs";

let deployers = {};

class TestDeployer {
  constructor(dir, dest, name, config) {
    deployers[name] = this;
    this.config = config;
    this.dir = dir;
    this.dest = dest;
    this.name = name;
  }
}

const { testDeploy, MockPlugin } = ConfigPoint.register({
  testDeploy: {
    configBase: deployConfig,
    deployPlugin: "MockPlugin",
    clientDeployURL: "s3://bucketName",
    rootDeployURL: "s3://",
    clientDir: "/src/static-wado/testdata/client",
  },

  plugins: {
    MockPlugin: "@ohif/static-wado-deploy/tests/unit/MockPlugin.mjs",
  },

  MockPlugin: {
    factory: (name, config) => {
      const dir = config[`${name}Dir`];
      const dest = config[`${name}DeployURL`];
      if (!dir || !dest) {
        console.log("config=", config);
        console.log("Can't create", name, dir, dest);
        return undefined;
      }
      return new TestDeployer(dir, dest, name, config);
    },
  },
});

function resetDeployers() {
  deployers = {};
}

const getDeployers = () => deployers;

export default MockPlugin;
export { MockPlugin, testDeploy, resetDeployers, getDeployers };
