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

/** Global logger options */
const globalOptions = {
  /* If true, output the log message level in all log messages */
  showLevel: false,

  /* If true, output the logger name in all log messages */
  showName: false,
};

/**
 * Wraps a loglevel logger to prepend optional perfixes to messages.
 *
 * Supports level inheritance: child loggers automatically inherit their parent's level
 * unless an explicit level has been set on the child via setLevel(). When a parent's
 * level changes, it propagates down to all children without explicit levels.
 *
 * @param {object} baseLogger - The loglevel logger to wrap
 * @param {object} options - Configuration options
 * @param {string} options.name - Logger name to display (defaults to baseLogger.name)
 * @param {object} options.parent - Parent wrapper for level inheritance (default: null)
 * @returns {object} Wrapped logger with showLevel, showName, and level inheritance
 */
function wrapLogger(baseLogger, options = {}) {
  const { name = baseLogger.name, parent = null } = options;

  const wrapper = {
    _baseLogger: baseLogger,
    _parent: parent,
    _children: [], // WeakRefs to child wrappers
    _hasExplicitLevel: false,
    name,
  };

  // Proxy all loglevel methods
  const logMethods = ['trace', 'debug', 'info', 'warn', 'error'];

  for (const method of logMethods) {
    wrapper[method] = function (...args) {
      if (args.length > 0) {
        if (globalOptions.showName && this.name) {
          args.unshift(`[${this.name}]`);
        }
        if (globalOptions.showLevel) {
          args.unshift(`[${levelNames[method]}]`);
        }
      }
      return baseLogger[method](...args);
    };
  }

  /**
   * Remove any children that have been garbage collected.
   */
  wrapper.removeStaleChildren = () => {
    wrapper._children = wrapper._children.filter(ref => ref.deref());
  };

  /**
   * Recursively propagates the given level to this logger and all children.
   * @param level {string} the log level to propagate
   */
  wrapper.propagateLevel = (level) => {
    wrapper.removeStaleChildren();
    for (const ref of wrapper._children) {
      ref.deref()?._inheritLevel(level);
    }
  };

  /**
   * Private method called by parent when its level changes.
   * Only updates the level if this logger doesn't have an explicit level set.
   * Recursively propagates to children.
   */
  wrapper._inheritLevel = level => {
    if (!wrapper._hasExplicitLevel) {
      baseLogger.setLevel(level);
      wrapper.propagateLevel(level);
    }
  };

  // Proxy other loglevel properties and methods
  wrapper.getLevel = () => baseLogger.getLevel();

  /**
   * Sets the log level for this logger and propagates to children.
   * Marks this logger as having an explicit level (won't inherit from parent).
   * @param level {string} the log level to set
   */
  wrapper.setLevel = level => {
    wrapper._hasExplicitLevel = true;
    baseLogger.setLevel(level);
    wrapper.propagateLevel(level);
  };

  wrapper.setDefaultLevel = level => baseLogger.setDefaultLevel(level);
  wrapper.enableAll = persist => baseLogger.enableAll(persist);
  wrapper.disableAll = persist => baseLogger.disableAll(persist);

  /**
   * Resets this logger to inherit its level from its parent.
   * If no parent exists, the level remains unchanged.
   */
  wrapper.resetLevel = () => {
    wrapper._hasExplicitLevel = false;
    if (wrapper._parent) {
      wrapper._inheritLevel(wrapper._parent.getLevel());
    }
  };

  // Support getLogger for child loggers
  wrapper.getLogger = (...names) => {
    const childName = `${wrapper.name}.${names.join('.')}`;
    const childBaseLogger = loglevel.getLogger(childName);
    const childWrapper = wrapLogger(childBaseLogger, {
      name: childName,
      parent: wrapper,
    });
    // Initialize child with parent's current level
    childWrapper._inheritLevel(baseLogger.getLevel());
    // Register child using WeakRef for GC safety
    wrapper._children.push(new WeakRef(childWrapper));
    return childWrapper;
  };

  return wrapper;
}

module.exports.wrapLoggerWithLevelPrefix = wrapLogger;

/**
 * Gets a root logger (no parent) and adds a getLogger function to get child loggers.
 * This looks like the loggers in the unreleased loglevel 2.0 and is intended
 * for forwards compatibility.
 */
function getRootLogger(name) {
  return wrapLogger(loglevel.getLogger(name));
}

module.exports.getRootLogger = getRootLogger;

/**
 * Gets a nested logger.
 * Child loggers inherit their level from their parent unless explicitly set.
 */
function getLogger(...name) {
  return getRootLogger(name.join('.'));
}

module.exports.getLogger = getLogger;
module.exports.globalOptions = globalOptions;

module.exports.staticDicomWebLog = getLogger('staticdicomweb');
module.exports.creatorLog = staticDicomWebLog.getLogger('creator');
module.exports.utilLog = staticDicomWebLog.getLogger('util');
module.exports.createDicomwebLog = staticDicomWebLog.getLogger('createdicomweb');
module.exports.webserverLog = staticDicomWebLog.getLogger('webserver');

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

/**
 * Valid log level names that can be used in environment variables.
 */
const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];

/**
 * Registry of all created loggers by name, for environment variable configuration.
 * Uses the logger name as key (e.g., 'staticdicomweb.webserver').
 */
const loggerRegistry = new Map();

// Register the pre-created loggers
loggerRegistry.set('staticdicomweb', module.exports.staticDicomWebLog);
loggerRegistry.set('staticdicomweb.creator', module.exports.creatorLog);
loggerRegistry.set('staticdicomweb.util', module.exports.utilLog);
loggerRegistry.set('staticdicomweb.createdicomweb', module.exports.createDicomwebLog);
loggerRegistry.set('staticdicomweb.webserver', module.exports.webserverLog);
loggerRegistry.set('consistency.dicom', module.exports.dicomConsistencyLog);
loggerRegistry.set('consistency.image', module.exports.imageConsistencyLog);

/**
 * Converts a logger name to its environment variable name.
 * Example: 'staticdicomweb.webserver' -> 'LOG_LEVEL_STATICDICOMWEB_WEBSERVER'
 *
 * @param {string} loggerName - The logger name with dot separators
 * @returns {string} The environment variable name
 */
function loggerNameToEnvVar(loggerName) {
  return 'LOG_LEVEL_' + loggerName.toUpperCase().replace(/\./g, '_');
}

/**
 * Converts an environment variable name to a logger name.
 * Example: 'LOG_LEVEL_STATICDICOMWEB_WEBSERVER' -> 'staticdicomweb.webserver'
 *
 * @param {string} envVar - The environment variable name
 * @returns {string|null} The logger name, or null if not a valid LOG_LEVEL_* variable
 */
function envVarToLoggerName(envVar) {
  if (!envVar.startsWith('LOG_LEVEL_')) {
    return null;
  }
  return envVar.slice('LOG_LEVEL_'.length).toLowerCase().replace(/_/g, '.');
}

/**
 * Configures log levels from environment variables.
 *
 * Supports two types of environment variables:
 * - LOG_LEVEL: Sets the default level for all loggers (e.g., LOG_LEVEL=debug)
 * - LOG_LEVEL_<NAME>: Sets level for a specific logger (e.g., LOG_LEVEL_STATICDICOMWEB_WEBSERVER=debug)
 *
 * Logger names use dots as separators, which become underscores in env var names:
 * - 'staticdicomweb' -> LOG_LEVEL_STATICDICOMWEB
 * - 'staticdicomweb.webserver' -> LOG_LEVEL_STATICDICOMWEB_WEBSERVER
 *
 * Valid levels: trace, debug, info, warn, error, silent
 *
 * @param {object} env - Environment object (defaults to process.env)
 * @returns {object} Object with applied configurations: { default: level, loggers: { name: level } }
 */
function configureFromEnv(env = process.env) {
  const applied = { default: null, loggers: {} };

  // First, apply the default LOG_LEVEL if set
  if (env.LOG_LEVEL) {
    const level = env.LOG_LEVEL.toLowerCase();
    if (validLevels.includes(level)) {
      // Set level on all root loggers (those without parents)
      for (const [name, logger] of loggerRegistry) {
        if (!logger._parent) {
          logger.setLevel(level);
        }
      }
      applied.default = level;
    } else {
      console.warn(`Invalid LOG_LEVEL value: "${env.LOG_LEVEL}". Valid levels: ${validLevels.join(', ')}`);
    }
  }

  // Then, apply specific logger levels from LOG_LEVEL_* variables
  for (const [envVar, value] of Object.entries(env)) {
    if (envVar === 'LOG_LEVEL' || !envVar.startsWith('LOG_LEVEL_')) {
      continue;
    }

    const level = value.toLowerCase();
    if (!validLevels.includes(level)) {
      console.warn(`Invalid ${envVar} value: "${value}". Valid levels: ${validLevels.join(', ')}`);
      continue;
    }

    const loggerName = envVarToLoggerName(envVar);
    const logger = loggerRegistry.get(loggerName);

    if (logger) {
      logger.setLevel(level);
      applied.loggers[loggerName] = level;
    } else {
      // Logger not found - might be created later, store for lazy application
      // For now, just warn
      console.warn(`Logger "${loggerName}" not found for ${envVar}. Available loggers: ${[...loggerRegistry.keys()].join(', ')}`);
    }
  }

  return applied;
}

module.exports.configureFromEnv = configureFromEnv;
module.exports.loggerNameToEnvVar = loggerNameToEnvVar;
module.exports.loggerRegistry = loggerRegistry;

globalThis.log ||= { ...loglevel, getLogger };
