const loglevelImport = require('loglevel');

/** Get the global/shared loglevel version */
const loglevel = loglevelImport.noConflict();

/** Level names for prefix output */
const levelNames = {
  trace: 'TRACE',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

/**
 * Wraps a loglevel logger to optionally prepend level and/or name prefixes to messages.
 * When showLevel is true, messages will be prefixed with [LEVEL], e.g., "[DEBUG] message"
 * When showName is true, messages will include logger name, e.g., "[DEBUG] [mylogger] message"
 *
 * @param {object} baseLogger - The loglevel logger to wrap
 * @param {object} options - Configuration options
 * @param {boolean} options.showLevel - Whether to show level prefixes (default: false)
 * @param {boolean} options.showName - Whether to show logger name (default: false)
 * @param {string} options.name - Logger name to display (defaults to baseLogger.name)
 * @returns {object} Wrapped logger with showLevel and showName properties
 */
function wrapLogger(baseLogger, options = {}) {
  const { showLevel = false, showName = false, name = baseLogger.name } = options;

  const wrapper = {
    _baseLogger: baseLogger,
    showLevel,
    showName,
    name,
  };

  // Proxy all loglevel methods
  const logMethods = ['trace', 'debug', 'info', 'warn', 'error'];

  for (const method of logMethods) {
    wrapper[method] = function (...args) {
      if ((this.showLevel || this.showName) && args.length > 0) {
        let prefix = '';
        if (this.showLevel) {
          prefix += `[${levelNames[method]}]`;
        }
        if (this.showName && this.name) {
          prefix += `${prefix ? ' ' : ''}[${this.name}]`;
        }
        if (prefix) {
          // If first arg is a string, prepend the prefix
          if (typeof args[0] === 'string') {
            args[0] = `${prefix} ${args[0]}`;
          } else {
            // Otherwise, add prefix as first argument
            args.unshift(prefix);
          }
        }
      }
      return baseLogger[method](...args);
    };
  }

  // Proxy other loglevel properties and methods
  wrapper.getLevel = () => baseLogger.getLevel();
  wrapper.setLevel = (level, persist) => baseLogger.setLevel(level, persist);
  wrapper.setDefaultLevel = level => baseLogger.setDefaultLevel(level);
  wrapper.enableAll = persist => baseLogger.enableAll(persist);
  wrapper.disableAll = persist => baseLogger.disableAll(persist);

  // Support getLogger for child loggers - inherit showLevel and showName settings
  wrapper.getLogger = (...names) => {
    const childName = `${wrapper.name}.${names.join('.')}`;
    const childLogger = getRootLogger(childName);
    return wrapLogger(childLogger, {
      showLevel: wrapper.showLevel,
      showName: wrapper.showName,
      name: childName,
    });
  };

  return wrapper;
}

module.exports.wrapLoggerWithLevelPrefix = wrapLogger;

/**
 * Gets a logger and adds a getLogger function to id to get child loggers.
 * This looks like the loggers in the unreleased loglevel 2.0 and is intended
 * for forwards compatibility.
 */
function getRootLogger(name) {
  return wrapLogger(loglevel.getLogger(name[0]));
}

module.exports.getRootLogger = getRootLogger;

/** Gets a nested logger.
 * This will eventually inherit the level from the parent level, but right now
 * it doesn't
 */
function getLogger(...name) {
  return getRootLogger(name.join('.'));
}

module.exports.getLogger = getLogger;

const staticDicomWebLog = getLogger('staticdicomweb');

module.exports.staticDicomWebLog = staticDicomWebLog;
module.exports.creatorLog = staticDicomWebLog.getLogger('creator');
module.exports.utilLog = staticDicomWebLog.getLogger('util');
// createDicomwebLog and webserverLog have showLevel and showName enabled by default
module.exports.createDicomwebLog = staticDicomWebLog.getLogger('createdicomweb');
module.exports.webserverLog = staticDicomWebLog.getLogger('webserver');

module.exports.createDicomwebLog.showLevel = true;
module.exports.webserverLog.showLevel = true;

module.exports.createDicomwebLog.showName = true;
module.exports.webserverLog.showName = true;

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
const dicomConsistencyLog = getLogger('consistency', 'dicom');
module.exports.dicomConsistencyLog = dicomConsistencyLog;

/** An image consistency/issue log for reporting image decompression issues */
module.exports.imageConsistencyLog = getLogger('consistency', 'image');

globalThis.log ||= { ...loglevel, getLogger };
