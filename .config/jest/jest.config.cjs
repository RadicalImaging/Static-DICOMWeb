const path = require('path');

const packageRoot = path.resolve(process.cwd());
const parentPackageRoot = path.resolve(__dirname, '../../');
const configRoot = path.join(parentPackageRoot, '/.config/jest');

module.exports = {
  // roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/test/**/*.jest.{js,cjs,mjs}'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  // testEnvironment: require.resolve('./utils/fixJSDOMJest.js'),
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'mjs'],
  transformIgnorePatterns: ['<rootDir>/node_modules/(?!@kitware/.*)'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/src/__mocks__/fileMock.js',
    '\\.(css|less)$': 'identity-obj-proxy',
  },
  // Setup
  // setupFiles: ["jest-canvas-mock/lib/index.js"],
  // Coverage
  transform: {
    '^.+\\.(js|jsx|ts|tsx|mjs)$': [
      'babel-jest',
      {
        plugins: ['babel-plugin-transform-import-meta'],
      },
    ],
  },
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,jsx,mjs}',
    // Not
    '!<rootDir>/src/**/*.test.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!<rootDir>/dist/**',
  ],
  globals: {
    TEST_DATA_PATH: path.join(parentPackageRoot, '/testdata'),
    OUTPUT_TEMP_PATH: path.join(packageRoot, '/tmp/dicomweb'),
  },
};
