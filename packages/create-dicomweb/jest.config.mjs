import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const baseConfig = require('../../.config/jest/jest.config.js');

export default {
  ...baseConfig,
  extensionsToTreatAsEsm: ['.js', '.mjs'],
  transform: {
    '^.+\\.(js|mjs)$': [
      'babel-jest',
      {
        presets: [
          [
            '@babel/preset-env',
            {
              targets: { node: 'current' },
              modules: 'auto', // Let Babel decide based on file extension
            },
          ],
        ],
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$|.*\\.js$))'],
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
};
