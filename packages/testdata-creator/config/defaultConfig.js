const ConfigPoint = require("config-point");
const createMain = require("../lib/createMain");

/**
 * Defines the basic configuration values for the command. See the README for more details.
 * TODO - fix the default values so they come from the configuration file.  In the meantime, leave the defaults blank.
 */
const { testdataConfig } = ConfigPoint.register({
  testdataConfig: {
    // This declare the inheritted configuration, don't assume this is directly accessible
    configBase: {},
    options: [
      {
        key: "-v, --verbose",
        description: "Write verbose output",
        defaultValue: false,
      },
      {
        key: "-t, --output-type <type>",
        description: "Output type",
        defaultValue: "jpg",
        choices: ["jpg", "dcm"],
      },
    ],
    programs: [
      {
        command: "create",
        isDefault: true,
        arguments: ["input"],
        main: createMain,
        helpDescription: "Make testdata set based on CSV input",
      },
    ],
  },
});

module.exports = testdataConfig;
