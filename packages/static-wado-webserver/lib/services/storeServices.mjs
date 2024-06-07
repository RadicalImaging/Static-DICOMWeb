/* eslint-disable import/prefer-default-export */
import fs from "fs";
import path from "path";
import { execSpawn, handleHomeRelative } from "@radicalimaging/static-wado-util";

const createCommandLine = (files, commandName, params) => {
  let commandline = commandName;
  commandline = commandline.replace(/<files>/, files.map((file) => file.filepath).join(" "));
  commandline = commandline.replace(/<rootDir>/, path.resolve(handleHomeRelative(params.rootDir)));
  return commandline;
};

/**
 * Save files using stow service, using the given stow command (from params)
 *
 * @param {*} files files to be stored
 * @param {*} params
 */
export const storeFilesByStow = (files, params = {}) => {
  const { stowCommands = [], notificationCommand, verbose = false } = params;

  const listFiles = Object.values(files).reduce((prev, curr) => prev.concat(curr), []);
  console.verbose(
    "Storing files",
    listFiles.map((item) => item.filepath)
  );

  const promises = [];
  for (const commandName of stowCommands) {
    const command = createCommandLine(listFiles, commandName, params);
    console.log("Store command", command);
    const commandPromise = execSpawn(command);
    promises.push(commandPromise);
  }

  return Promise.allSettled(promises).then(() => {
    if (notificationCommand) {
      console.warn("Executing notificationCommand", notificationCommand);
      execSpawn(notificationCommand);
    }
    listFiles.forEach((item) => {
      const { filepath } = item;
      if (verbose) console.log("Unlinking", filepath);
      fs.unlink(filepath, () => null);
    });
    return listFiles.map((it) => it.filepath);
  });
};
