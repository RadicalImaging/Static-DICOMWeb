const mkdicomwebConfig = require("./mkdicomwebConfig");
const StaticWado = require("./StaticWado");

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = require("./createMain");
StaticWado.deleteMain = require("./deleteMain");
StaticWado.adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = StaticWado;
