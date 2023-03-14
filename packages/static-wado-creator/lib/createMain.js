const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
    // Instance metadata is the instances/<sopUID>/metadata.gz files
    isInstanceMetadata: true,
    // Deduplicated data is single instance deduplicated data
    isDeduplicate: false,
    isGroup: true,
    isStudyData: true,
  });
  const importer = new StaticWado(finalOptions);
  return importer.executeCommand(program.args);
};
