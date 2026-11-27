const baseConfig = require('../../.config/jest/jest.config.cjs');

module.exports = {
  ...baseConfig,
  testEnvironment: 'node',
  // A cold Babel cache (CI) transforms dcmjs-commands inside the first test.
  testTimeout: 60_000,
  // The hoisted node_modules is outside <rootDir>, so babel transforms it. Skip the codecs:
  // babel on their multi-MB WASM glue takes more than a minute on CI.
  transformIgnorePatterns: ['/node_modules/@cornerstonejs/(codec-[^/]+|dicom-codec)/'],
  // Inline options, so that babel also transforms @dcmjs-org/commands in the root pnpm store.
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
