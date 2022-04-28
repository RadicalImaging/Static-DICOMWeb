import staticWadoUtil, {staticWadoConfig, updateConfiguration} from "@ohif/static-wado-util";
import {DeployGroup} from "../index.mjs";

async function studiesMain() {
  const rootDeployer = new DeployGroup(this.awsConfig,"root");
  await rootDeployer.store("studies");
}

async function clientMain() {
  const ohifDeployer = new DeployGroup(this.awsConfig, "client");
  await ohifDeployer.store();
}

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults = awsConfig) {
  const configurationFile = await staticWadoUtil.loadConfiguration(defaults, process.argv);

  const { argumentsRequired = [], optionsRequired = [], helpShort, helpDescription } = defaults;

  const argumentsList = [];

  // program command options
  const optionsList = [
    {
      key: "-v, --verbose",
      description: "Write verbose output",
      defaultValue: false,
    },
  ];

  const program = staticWadoUtil.configureCommands(defaults, optionsList);
  const opts = program.opts();
  program.deployConfig = Object.assign(Object.create(defaults), opts);

  program.main = () => {
    console.log("Running main on deploy - should configure actions");
  };
  program.configurationFile = configurationFile;

  return program;
}

export default configureProgram;
