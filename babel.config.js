module.exports = {
  parser: "babel-eslint",
  parserOptions: {
    "sourceType": "module",
    "allowImportExportEverywhere": true
  },
  presets: [
    '@babel/preset-env'
  ],
  plugins: [
    // Besides the presets, use this plugin
    '@babel/plugin-proposal-class-properties',
    "@babel/transform-runtime"
  ]
}


