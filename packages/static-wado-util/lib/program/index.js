const { program, Argument } = require("commander");
const loadConfiguration = require("../loadConfiguration");

function configureBaseProgram(configuration) {
  const { helpDescription, helpShort } = configuration;

  program.name(helpShort).configureHelp({ sortOptions: true }).addHelpText("beforeAll", helpDescription).addHelpCommand();

  return program;
}

const addOptions = (cmd, options) => {
  if (options) {
    options.forEach((optionConfig) => {
      const { key, description, defaultValue, choices, isRequired, customParser } = optionConfig;
      const option = cmd.createOption(key, description);
      option.default(defaultValue);
      if (customParser) {
        option.argParser(customParser);
      }
      if (isRequired) {
        option.makeOptionMandatory();
      }
      if (Array.isArray(choices)) {
        option.choices(choices);
      }

      cmd.addOption(option);
    });
  }
};

function configureCommands(config, configurationFile) {
  // console.log("Configure commands for", config);
  const { programs: programsDefinition, options } = config;

  for (const item of programsDefinition) {
    const { command, helpDescription, main, isDefault, options: subOptions } = item;
    const cmdConfig = program.command(command, { isDefault }).description(helpDescription);
    cmdConfig.action((...args) => main.call(config, ...args, configurationFile));
    addOptions(cmdConfig, options);
    addOptions(cmdConfig, subOptions);
  }
  program.parse();
}

/**
 * Configure static-wado commander program. Ideally it should be called just once.
 * Used by static-wado packages command commands.
 *
 * @param {*} configuration Configuration object from command level
 * @returns Program object
 */
function configureProgram(configuration) {
  const { argumentsRequired = [], optionsRequired = [], argumentsList = [], optionsList = [], packageJson = {} } = configuration;

  program.version(packageJson.version);
  const currentProgram = configureBaseProgram(configuration);

  // program command options
  argumentsRequired.forEach((argName) => {
    argumentsList.forEach((argObject) => {
      if (argObject.key.includes(argName)) {
        program.addArgument(new Argument(argObject.key, argObject.description));
      }
    });
  });

  optionsList.push({
    key: "-c, --configuration <config-file.json5>",
    description: "Sets the base configurationfile, defaults to static-wado.json5 located in the current directory or in user home directory",
  });

  // iterate over option list and set to program
  optionsList.forEach(({ key, description, defaultValue, choices }) => {
    const option = currentProgram.createOption(key, description);

    option.default(defaultValue);

    if (optionsRequired.includes(option.short) || optionsRequired.includes(option.long)) {
      option.makeOptionMandatory();
    }

    if (Array.isArray(choices)) {
      option.choices(choices);
    }

    currentProgram.addOption(option);
  });

  currentProgram.parse();

  return currentProgram;
}

exports.configureProgram = configureProgram;
exports.program = program;
exports.configureCommands = configureCommands;
exports.loadConfiguration = loadConfiguration;
