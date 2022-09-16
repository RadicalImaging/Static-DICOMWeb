const path = require('path');
const pkg = require('../package.json');

const outputFile = 'index.js';
const rootDir = path.resolve(__dirname, '../');
const outputFolder = path.join(__dirname, '../dist/');

const config = {
  mode: 'development',
  entry: rootDir + '/' + pkg.module,
  devtool: 'source-map',
  target: 'node',
  output: {
    path: outputFolder,
    filename: outputFile,
    library: pkg.name,
  },
  module: {
    rules: [
      {
        test: /(\.jsx|\.js|\.tsx|\.ts)$/,
        loader: 'babel-loader',
        exclude: /(node_modules)/,
        resolve: {
          extensions: ['.js', '.jsx', '.ts', '.tsx',],
        },
      },
    ],
  },
  resolve: {
   extensions: ['.json', '.js', '.jsx', '.tsx', '.ts',],
  },
};

module.exports = config;
