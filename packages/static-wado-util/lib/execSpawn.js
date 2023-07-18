const process = require("node:child_process");

/** Creates a separated child process */
module.exports = function execSpawn(cmdLine) {
  return new Promise((resolve, reject) => {
    try {
      const child = process.spawn(cmdLine, { shell: true, stdio: 'inherit' });
      child.on("close", (code) => {
        console.log("child process", cmdLine, "exited with code ", code);
        resolve(code);
      });
    } catch (e) {
      reject(e);
    }
  });
};
