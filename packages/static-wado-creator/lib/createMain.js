const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
    isInstance: false,
    isGroup: true,
    isDeduplicate: true,
    isStudyData: true,
  });
  const importer = new StaticWado(finalOptions);
  return importer.executeCommand(program.args);
};
