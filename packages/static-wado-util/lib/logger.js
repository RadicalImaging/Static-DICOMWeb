const loglevelImport = require("loglevel");

/** Get the global/shared loglevel version */
const loglevel = loglevelImport.noConflict();

/**
 * Gets a logger and adds a getLogger function to id to get child loggers.
 * This looks like the loggers in the unreleased loglevel 2.0 and is intended
 * for forwards compatibility.
 */
function getRootLogger(name) {
  const logger = loglevel.getLogger(name[0]);
  logger.getLogger = (...names) => {
    return getRootLogger(`${name}.${names.join(".")}`);
  };
  return logger;
}

module.exports.getRootLogger = getRootLogger;

/** Gets a nested logger.
 * This will eventually inherit the level from the parent level, but right now
 * it doesn't
 */
function getLogger(...name) {
  return getRootLogger(name.join("."));
}

module.exports.getLogger = getLogger;

const staticDicomWebLog = getLogger("staticdicomweb");

module.exports.staticDicomWebLog = staticDicomWebLog;
module.exports.creatorLog = staticDicomWebLog.getLogger("creator");
module.exports.utilLog = staticDicomWebLog.getLogger("util");

/**
 * Dicom issue log is for reporting inconsistencies and issues with DICOM logging
 * This log is separated from the cs3d hierarchy to allow separation of logs
 * by use of an external appender to store inconsistencies and invalid DICOM
 * values separately.
 *
 * Levels:
 * * error - this is an issue in the data which prevents displaying at all
 * * warn - a serious issue in the data which could cause significant display
 *       issues or mismatches of data.
 * * info - an issue in the data which is handled internally or worked around such
 *       as not having patient name separated by `^` characters.
 * * debug - an issue in the data which is common and is easily managed
 */
const dicomConsistencyLog = getLogger("consistency", "dicom");
module.exports.dicomConsistencyLog = dicomConsistencyLog;

/** An image consistency/issue log for reporting image decompression issues */
module.exports.imageConsistencyLog = getLogger("consistency", "image");

globalThis.log ||= { ...loglevel, getLogger };
