const fs = require('fs');
const path = require('path');

/**
 * Executes a given callback on the scanned list of names, OR matches up the names present
 * in the actual directory with the specified list.
 */
async function dirScanner(input, options) {
  let files = input;
  if (!Array.isArray(files)) files = [files];
  for (let i = 0; i < files.length; i++) {
    let file = files[i];
    // Resolve "." to the current working directory
    if (file === '.') {
      file = process.cwd();
    }
    const base = path.basename(file);
    if (base === '__MACOSX' || base.startsWith('.')) {
      continue;
    }
    if (!fs.existsSync(file)) {
      console.warn('File does not exist', file);
      continue;
    }
    if (fs.lstatSync(file).isDirectory()) {
      const names = await fs.promises.readdir(file);
      const filtered = names.filter(
        (name) => name !== '__MACOSX' && !name.startsWith('.')
      );
      if (options.recursive !== false) {
        await dirScanner(
          filtered.map((dirFile) => `${file}/${dirFile}`),
          options
        );
      } else {
        for (let j = 0; j < filtered.length; j++) {
          const name = filtered[j];
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
        if (options.verbose) console.warn('Exception', e);
        console.error("Couldn't process", file);
        console.verbose('Error', e);
      }
    }
  }
}

module.exports = dirScanner;
