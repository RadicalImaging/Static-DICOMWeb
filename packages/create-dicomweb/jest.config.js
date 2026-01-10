const baseConfig = require("../../.config/jest/jest.config")

delete baseConfig.testRegex;

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/**/*.mjs'],
  // Don't transform .mjs files - they're native ES modules
  // Only transform other JS files with the base config
  transform: {
    ...baseConfig.transform,
  },
  transformIgnorePatterns: [
    ...(baseConfig.transformIgnorePatterns || []),
    // Don't transform .mjs files anywhere - they're loaded as native ES modules
    '.*\\.mjs$',
  ],
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
  },
};
