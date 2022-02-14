"use strict";

const { program, Argument } = require("commander");

function configureBaseProgram(configuration) {
  const { helpDescription, helpShort } = configuration;

  program
    .name(helpShort)
    .configureHelp({ sortOptions: true })
    .addHelpText("beforeAll", helpDescription)
    .addHelpCommand();

  return program;
}

/**
 * Configure static-wado commander program. Ideally it should be called just once.
 * Used by static-wado packages command commands.
 *
 * @param {*} configuration Configuration object from command level
 * @returns Program object
 */
function configureProgram(configuration) {
  const {
    argumentsRequired = [],
    optionsRequired = [],
    argumentsList = [],
    optionsList = [],
    packageJson = {},
  } = configuration;

  program.version(packageJson.version);

  const _program = configureBaseProgram(configuration);

  // program command options
  argumentsRequired.forEach((argName) => {
    argumentsList.forEach((argObject) => {
      if (argObject.key.includes(argName)) {
        program.addArgument(new Argument(argObject.key, argObject.description));
      }
    });
  });

  // iterate over option list and set to program
  optionsList.forEach(({ key, description, defaultValue, choices }) => {
    const option = _program.createOption(key, description);

    option.default(defaultValue);

    if (
      optionsRequired.includes(option.short) ||
      optionsRequired.includes(option.long)
    ) {
      option.makeOptionMandatory();
    }

    if (Array.isArray(choices)) {
      option.choices(choices);
    }

    _program.addOption(option);
  });

  _program.parse();

  return _program;
}

exports.configureProgram = configureProgram;
exports.program = program;
