const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = function rejectMain(args, options) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
    isGroup: true,
    isStudyData: true,
  });
  const importer = new StaticWado(finalOptions);
  return importer.reject(args);
};
