const mkdicomwebConfig = require("./mkdicomwebConfig");
const StaticWado = require("./StaticWado");

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = require("./createMain");
StaticWado.deleteMain = require("./deleteMain");

module.exports = StaticWado;
