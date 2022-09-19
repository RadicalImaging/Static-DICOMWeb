const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = function createMain(options) {
  const finalOptions = adaptProgramOpts(options, {
    ...this,
  });
  const importer = new StaticWado(finalOptions);
  return importer.reindex();
};
