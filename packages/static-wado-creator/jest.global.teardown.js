
const path = require('path');
const deleteDir = require("./lib/util/deleteDir");

const packageRoot = path.resolve(__dirname, './');

module.exports = async (globals) => {
  console.log('removing temp folder', globals);
  await deleteDir(path.join(packageRoot, "/tmp"), true);
};