const baseConfig = require('../../.config/jest/jest.config.cjs');

module.exports = {
  ...baseConfig,
  testEnvironment: 'node',
  // Inline options, so that babel also transforms the linked @dcmjs/commands outside the repository
  transform: {
    '^.+\\.(js|mjs)$': [
      'babel-jest',
      {
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
        plugins: ['babel-plugin-transform-import-meta'],
      },
    ],
  },
};
