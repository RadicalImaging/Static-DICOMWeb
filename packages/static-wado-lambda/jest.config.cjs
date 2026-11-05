const baseConfig = require('../../.config/jest/jest.config.cjs');

module.exports = {
  ...baseConfig,
  testEnvironment: 'node',
  // Inline options, so that babel also transforms the linked @dcmjs/commands outside the repository.
  // TypeScript: the root export of static-wado-util, which the create-dicomweb test fixture loads.
  transform: {
    '^.+\\.(js|mjs|ts)$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
        plugins: ['babel-plugin-transform-import-meta'],
      },
    ],
  },
};
