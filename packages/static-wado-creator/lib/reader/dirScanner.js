const fs = require("fs");

/**
 * Executes a given callback on the scanned list of names, OR matches up the names present
 * in the actual directory with the specified list.
 */
async function dirScanner(input, options) {
  let files = input;
  if (!Array.isArray(files)) files = [files];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (fs.lstatSync(file).isDirectory()) {
      const names = await fs.promises.readdir(file);
      if (options.recursive !== false) {
        await dirScanner(
          names.map((dirFile) => `${file}/${dirFile}`),
          options
        );
      } else {
        for (let j = 0; j < names.length; j++) {
          const name = names[j];
          if (
            !options.matchList ||
            options.matchList.length == 0 ||
            options.matchList.contains(name)
          ) {
            await options.callback(file, name);
          }
        }
      }
    } else {
      try {
        await options.callback(file);
      } catch (e) {
        console.error("Couldn't process", file, e);
      }
    }
  }
}

module.exports = dirScanner;
