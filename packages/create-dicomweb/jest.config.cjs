const baseConfig = require('../../.config/jest/jest.config.cjs');

module.exports = {
  ...baseConfig,
  setupFilesAfterEnv: ['<rootDir>/test/jestSetup.mjs'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'mjs'],
  transformIgnorePatterns: [
    // Transform all ESM modules in node_modules, including Bun's .bun directory structure
    '/node_modules/(?!(\\.bun/)?(@cornerstonejs|@kitware|d3-scale|d3-array|d3-color|d3-format|d3-interpolate|d3-time|d3-time-format|internmap))',
  ],
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|jsx|ts|tsx|mjs)$': [
      'babel-jest',
      {
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
        plugins: [
          'babel-plugin-transform-import-meta',
          '@babel/plugin-proposal-class-properties',
          '@babel/plugin-transform-private-methods',
          '@babel/plugin-transform-modules-commonjs',
          '@babel/plugin-transform-class-static-block',
        ],
      },
    ],
  },
};
