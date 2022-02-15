const fs = require("fs");
const path = require("path");
const packageRoot = path.resolve(process.cwd());

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

module.exports = async () => {
  const dir = path.join(packageRoot, "/tmp");
  try {
    if (fs.existsSync(dir)) {
      console.log("removing temporary folder");
      await deleteDir(dir, true);
    }
  } catch (e) {
    console.log(e);
  }
};
