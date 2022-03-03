/* eslint-disable import/prefer-default-export */
import childProcess from "child_process";
import util from "util";
import fs from "fs";

const exec = util.promisify(childProcess.exec);

const createCommandLine = (files, commandName) => files.reduce((p, c) => `${p} ${c.filepath}`, commandName);

/**
 * Save files using stow service, using the given stow command (from params)
 *
 * @param {*} files files to be stored
 * @param {*} params
 */
export const storeFilesByStow = (files, params = {}) => {
  const { stowCommands = [], verbose = false } = params;

  const listFiles = Object.values(files).reduce((prev, curr) => prev.concat(curr), []);
  if (verbose)
    console.log(
      "Storing files",
      listFiles.map((item) => item.filepath)
    );

  const promises = [];
  for (const commandName of stowCommands) {
    const command = createCommandLine(listFiles, commandName);
    const commandPromise = exec(command);
    commandPromise.then(({ stdout, stderr }) => console.log(stdout, stderr));
    promises.push(commandPromise);
  }
  Promise.all(promises).then(() => {
    listFiles.forEach((item) => {
      const { filepath } = item;
      if (verbose) console.log("Unlinking", filepath);
      fs.unlink(filepath, () => null);
    });
  });
};
