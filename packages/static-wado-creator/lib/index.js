const mkdicomwebConfig = require("./mkdicomwebConfig");
const StaticWado = require("./StaticWado");
const { configureProgram } = require("./program/index.js");

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = require("./createMain");
StaticWado.deleteMain = require("./deleteMain");
StaticWado.adaptProgramOpts = require("./util/adaptProgramOpts");
StaticWado.configureProgram = configureProgram;

module.exports = StaticWado;
