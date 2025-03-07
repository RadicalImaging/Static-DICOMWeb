const baseConfig = require("../../.config/jest/jest.config")

module.exports = {
  ...baseConfig,
  transformIgnorePatterns: [
    // all exceptions must be first line
    "/node_modules/(?!@cornerstonejs)",
  ],
}
