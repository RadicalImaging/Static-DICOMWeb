const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
    isInstance: false,
    isDeduplicate: true,
    isGroup: true,
    isStudyData: false,
    scanStudies: true,
    isDeleteInstances: true,
  });
  const importer = new StaticWado(finalOptions);
  // Either do a scan or on specified studies
  return importer.executeCommand(program.args);
};
