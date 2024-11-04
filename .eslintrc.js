module.exports = {
  env: {
    jest: true,
    node: true,
    commonjs: true,
    es2021: true,
    "jest/globals": true,
  },
  extends: ["prettier", "plugin:node/recommended"],
  plugins: ["eslint-plugin-prettier", "jest"],
  parserOptions: {
    ecmaVersion: 2021,
  },
  ignorePatterns: [
    ".eslintrc.js",
    "dist",
    "build",
    "node_modules",
    "rollup.config.js",
    "jest.config.js",
  ],
  rules: {
    // Enforce consistent brace style for all control statements for readability
    curly: "warn",
    "node/no-unsupported-features/es-syntax": 0,
  },
}
