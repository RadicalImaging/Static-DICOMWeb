module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true,
    "jest/globals": true
  },
  extends: [
    'airbnb-base',
    "prettier",
    "plugin:node/recommended"
  ],
  plugins: [
    "eslint-plugin-prettier",
    "jest"
  ],
  parserOptions: {
    "ecmaVersion": 2020
  },
  rules: {
    "no-param-reassign": "warn",
    'prettier/prettier': 'warn',
    "no-console": 0,
    eqeqeq: 0,
    "max-len": [2, {"code": 168, "ignoreUrls": true}],
    "no-await-in-loop": 0,
    "no-mixed-operators": 0,
    "no-plusplus": ["error", { "allowForLoopAfterthoughts": true }],
    "no-continue": 0,
    "radix": 0,
    "no-underscore-dangle": 0,
    "no-restricted-syntax": "warn",
    "consistent-return": "warn",
    "prefer-destructuring": 0,
  },
};
