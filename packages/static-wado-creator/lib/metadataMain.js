const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
    isInstance: false,
    isGroup: true,
    isStudyData: true,
    scanStudies: true,
  });
  const importer = new StaticWado(finalOptions);
  // Either do a scan or on specified studies
  return importer.executeCommand(program.args);
};
