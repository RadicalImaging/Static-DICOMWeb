const { program, configureProgram, configureCommands } = require("./program")
const { Stats } = require("./stats")
const { bilinear, replicate } = require("./image/bilinear")
module.exports.handleHomeRelative = require("./handleHomeRelative")
module.exports.JSONReader = require("./reader/JSONReader")
module.exports.readBulkData = require("./reader/readBulkData")
module.exports.JSONWriter = require("./writer/JSONWriter")
module.exports.dirScanner = require("./reader/dirScanner")
module.exports.qidoFilter = require("./qidoFilter")
module.exports.loadConfiguration = require("./loadConfiguration")
module.exports.aeConfig = require("./aeConfig")
module.exports.staticWadoConfig = require("./staticWadoConfig")
module.exports.assertions = require("./assertions")
module.exports.configDiff = require("./update/configDiff")
module.exports.configGroup = require("./configGroup.js")
module.exports.asyncIterableToBuffer = require("./asyncIterableToBuffer")
module.exports.Tags = require("./dictionary/Tags")
module.exports.dataDictionary = require("./dictionary/dataDictionary")
module.exports.sleep = require("./sleep")
module.exports.endsWith = require("./endsWith")
module.exports.NotificationService = require("./NotificationService")
module.exports.execSpawn = require("./execSpawn")
module.exports.logger = require("./logger.js")

module.exports.bilinear = bilinear
module.exports.replicate = replicate
module.exports.configureProgram = configureProgram
module.exports.configureCommands = configureCommands
module.exports.program = program
module.exports.Stats = Stats

module.exports.default = {
  ...module.exports,
  staticWadoConfig: module.exports.staticWadoConfig,
}
