const fs = require("fs");

async function deleteDir(dir) {
  try {
    // equivalent to rm -rf
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch (error) {
    console.log(`error: ${error.message}`);
    return;
  }

  console.log("Delete done");
}

module.exports = deleteDir;
