import {
  getRootLogger,
  getLogger,
  globalOptions,
  wrapLoggerWithLevelPrefix,
  configureFromEnv,
  loggerNameToEnvVar,
  loggerRegistry,
} from '../../lib/logger.js';

describe('logger', () => {
  // Save original globalOptions values to restore after tests
  let originalShowLevel;
  let originalShowName;

  beforeEach(() => {
    originalShowLevel = globalOptions.showLevel;
    originalShowName = globalOptions.showName;
    // Reset to defaults before each test
    globalOptions.showLevel = false;
    globalOptions.showName = false;
  });

  afterEach(() => {
    // Restore original values
    globalOptions.showLevel = originalShowLevel;
    globalOptions.showName = originalShowName;
  });

  describe('log level inheritance', () => {
    it('child logger inherits parent level on creation', () => {
      const parent = getRootLogger('test.inheritance.create');
      parent.setLevel('warn');

      const child = parent.getLogger('child');
      expect(child.getLevel()).toBe(parent.getLevel());
    });

    it('child logger inherits new parent level when parent level changes', () => {
      const parent = getRootLogger('test.inheritance.propagate');
      parent.setLevel('info');

      const child = parent.getLogger('child');
      expect(child.getLevel()).toBe(parent.getLevel());

      // Change parent level
      parent.setLevel('debug');
      expect(child.getLevel()).toBe(parent.getLevel());
    });

    it('child with explicit level does not inherit parent level changes', () => {
      const parent = getRootLogger('test.inheritance.explicit');
      parent.setLevel('info');

      const child = parent.getLogger('child');
      child.setLevel('error'); // Set explicit level

      // Change parent level
      parent.setLevel('debug');

      // Child should retain its explicit level
      expect(child.getLevel()).not.toBe(parent.getLevel());
    });

    it('resetLevel makes child inherit parent level again', () => {
      const parent = getRootLogger('test.inheritance.reset');
      parent.setLevel('info');

      const child = parent.getLogger('child');
      child.setLevel('error'); // Set explicit level

      // Verify child has different level
      expect(child.getLevel()).not.toBe(parent.getLevel());

      // Reset child to inherit
      child.resetLevel();
      expect(child.getLevel()).toBe(parent.getLevel());

      // Verify inheritance works again after reset
      parent.setLevel('debug');
      expect(child.getLevel()).toBe(parent.getLevel());
    });

    it('level changes propagate through multiple generations', () => {
      const grandparent = getRootLogger('test.inheritance.generations');
      grandparent.setLevel('info');

      const parent = grandparent.getLogger('parent');
      const child = parent.getLogger('child');

      expect(parent.getLevel()).toBe(grandparent.getLevel());
      expect(child.getLevel()).toBe(grandparent.getLevel());

      // Change grandparent level
      grandparent.setLevel('debug');

      expect(parent.getLevel()).toBe(grandparent.getLevel());
      expect(child.getLevel()).toBe(grandparent.getLevel());
    });

    it('explicit level in middle of hierarchy blocks propagation', () => {
      const grandparent = getRootLogger('test.inheritance.block');
      grandparent.setLevel('info');

      const parent = grandparent.getLogger('parent');
      parent.setLevel('warn'); // Explicit level blocks inheritance

      const child = parent.getLogger('child');
      expect(child.getLevel()).toBe(parent.getLevel());

      // Change grandparent level - should not affect parent or child
      grandparent.setLevel('debug');

      expect(parent.getLevel()).not.toBe(grandparent.getLevel());
      expect(child.getLevel()).toBe(parent.getLevel());
    });

    it('child logger has correct hierarchical name', () => {
      const parent = getRootLogger('test.naming');
      const child = parent.getLogger('child');
      const grandchild = child.getLogger('grandchild');

      expect(parent.name).toBe('test.naming');
      expect(child.name).toBe('test.naming.child');
      expect(grandchild.name).toBe('test.naming.child.grandchild');
    });
  });

  describe('prefixing logic', () => {
    let capturedArgs;
    let mockBaseLogger;
    let wrapper;

    beforeEach(() => {
      capturedArgs = [];
      mockBaseLogger = {
        name: 'test.prefix',
        trace: (...args) => { capturedArgs = args; },
        debug: (...args) => { capturedArgs = args; },
        info: (...args) => { capturedArgs = args; },
        warn: (...args) => { capturedArgs = args; },
        error: (...args) => { capturedArgs = args; },
        getLevel: () => 0,
        setLevel: () => {},
        setDefaultLevel: () => {},
        enableAll: () => {},
        disableAll: () => {},
      };
      wrapper = wrapLoggerWithLevelPrefix(mockBaseLogger);
    });

    it('does not add prefixes when both options are false', () => {
      globalOptions.showLevel = false;
      globalOptions.showName = false;

      wrapper.info('test message');

      expect(capturedArgs).toEqual(['test message']);
    });

    it('adds level prefix when showLevel is true', () => {
      globalOptions.showLevel = true;
      globalOptions.showName = false;

      wrapper.info('test message');

      expect(capturedArgs).toEqual(['[INFO]', 'test message']);
    });

    it('adds name prefix when showName is true', () => {
      globalOptions.showLevel = false;
      globalOptions.showName = true;

      wrapper.info('test message');

      expect(capturedArgs).toEqual(['[test.prefix]', 'test message']);
    });

    it('adds both prefixes when both options are true (level first, then name)', () => {
      globalOptions.showLevel = true;
      globalOptions.showName = true;

      wrapper.info('test message');

      expect(capturedArgs).toEqual(['[INFO]', '[test.prefix]', 'test message']);
    });

    it('does not add prefixes for empty log calls', () => {
      globalOptions.showLevel = true;
      globalOptions.showName = true;

      wrapper.info();

      expect(capturedArgs).toEqual([]);
    });

    it('uses correct level names for each log method', () => {
      globalOptions.showLevel = true;
      globalOptions.showName = false;

      wrapper.trace('msg');
      expect(capturedArgs[0]).toBe('[TRACE]');

      wrapper.debug('msg');
      expect(capturedArgs[0]).toBe('[DEBUG]');

      wrapper.info('msg');
      expect(capturedArgs[0]).toBe('[INFO]');

      wrapper.warn('msg');
      expect(capturedArgs[0]).toBe('[WARN]');

      wrapper.error('msg');
      expect(capturedArgs[0]).toBe('[ERROR]');
    });

    it('preserves multiple arguments in log call', () => {
      globalOptions.showLevel = true;
      globalOptions.showName = true;

      wrapper.info('message', { data: 123 }, 'extra');

      expect(capturedArgs).toEqual([
        '[INFO]',
        '[test.prefix]',
        'message',
        { data: 123 },
        'extra',
      ]);
    });
  });

  describe('getLogger and getRootLogger', () => {
    it('getRootLogger creates a logger with the given name', () => {
      const logger = getRootLogger('myapp');
      expect(logger.name).toBe('myapp');
    });

    it('getLogger with single name creates root logger', () => {
      const logger = getLogger('standalone');
      expect(logger.name).toBe('standalone');
    });

    it('getLogger with multiple names joins them with dots', () => {
      const logger = getLogger('app', 'module', 'submodule');
      expect(logger.name).toBe('app.module.submodule');
    });
  });

  describe('configureFromEnv', () => {
    it('applies LOG_LEVEL to root loggers', () => {
      const testLogger = getRootLogger('test.env.default');
      loggerRegistry.set('test.env.default', testLogger);

      const result = configureFromEnv({ LOG_LEVEL: 'debug' });

      expect(result.default).toBe('debug');

      // Clean up
      loggerRegistry.delete('test.env.default');
    });

    it('applies specific logger level from LOG_LEVEL_* variable', () => {
      const testLogger = getRootLogger('test.env.specific');
      loggerRegistry.set('test.env.specific', testLogger);

      const result = configureFromEnv({
        LOG_LEVEL_TEST_ENV_SPECIFIC: 'error',
      });

      expect(result.loggers['test.env.specific']).toBe('error');
      expect(testLogger.getLevel()).toBe(4); // error level

      // Clean up
      loggerRegistry.delete('test.env.specific');
    });

    it('ignores invalid log levels with warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = configureFromEnv({ LOG_LEVEL: 'invalid' });

      expect(result.default).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid LOG_LEVEL value')
      );

      consoleSpy.mockRestore();
    });

    it('warns for unknown logger names', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      configureFromEnv({
        LOG_LEVEL_NONEXISTENT_LOGGER: 'debug',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Logger "nonexistent.logger" not found')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('loggerNameToEnvVar', () => {
    it('converts simple logger name', () => {
      expect(loggerNameToEnvVar('mylogger')).toBe('LOG_LEVEL_MYLOGGER');
    });

    it('converts dotted logger name to underscored env var', () => {
      expect(loggerNameToEnvVar('staticdicomweb.webserver')).toBe(
        'LOG_LEVEL_STATICDICOMWEB_WEBSERVER'
      );
    });

    it('converts multi-level dotted name', () => {
      expect(loggerNameToEnvVar('app.module.submodule')).toBe(
        'LOG_LEVEL_APP_MODULE_SUBMODULE'
      );
    });
  });
});
