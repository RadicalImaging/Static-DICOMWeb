const TestdataCreator = require("./TestdataCreator");

module.exports = function createMain(options, program) {
  const finalOps = {
    ...options,
    maximumInlinePrivateLength: 64,
    maximumInlinePublicLength: 128 * 1024 + 2,
  };
  const importer = new TestdataCreator(finalOps);

  return importer.executeCommand(program.args);
};
