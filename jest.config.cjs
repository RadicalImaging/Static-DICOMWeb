/**
 * Root Jest config so the Test Explorer and Jest extension discover tests in
 * packages/create-dicomweb (e.g. test/**/*.jest.mjs). Run from repo root:
 *   bun run test --packages=create-dicomweb  (or use lerna)
 * Or run Jest with this config: jest --config jest.config.cjs
 */
module.exports = {
  projects: ['./packages/create-dicomweb'],
};
