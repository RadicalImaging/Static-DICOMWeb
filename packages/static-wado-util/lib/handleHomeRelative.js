const homedir = require("os").homedir();
const path = require("path");

const handleHomeRelative = (dirName) =>
  dirName[0] == "~" ? path.join(homedir, dirName.substring(1)) : dirName;

module.exports = handleHomeRelative;
