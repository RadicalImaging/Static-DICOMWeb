import staticWadoUtil from "@ohif/static-wado-util";
import "../index.mjs";

/**
 * Configure static-wado-creator commander program.
 *
 * @param {*} defaults Configuration caller level
 * @returns Program object
 */
async function configureProgram(defaults = {}) {
  const configurationFile = await staticWadoUtil.loadConfiguration(defaults, process.argv);

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
