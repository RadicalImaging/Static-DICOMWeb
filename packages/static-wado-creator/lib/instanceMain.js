const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
    isInstance: true,
    // Deduplicated data is single instance deduplicated data
    isDeduplicate: true,
    isGroup: false,
    isStudyData: false,
  });
  const importer = new StaticWado(finalOptions);
  return importer.executeCommand(program.args);
};
