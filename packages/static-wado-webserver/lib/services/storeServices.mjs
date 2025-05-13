/* eslint-disable import/prefer-default-export */
import fs from "fs";
import path from "path";
import childProcess from "node:child_process";
import {
  extractMultipart,
  uint8ArrayToString,
  execSpawn,
  handleHomeRelative,
} from "@radicalimaging/static-wado-util";
import { mkdicomwebSpawn } from "./util/serverSpawn.mjs";

const createCommandLine = (args, commandName, params) => {
  let commandline = Array.isArray(commandName)
    ? commandName.join(" ")
    : commandName;
  const { listFiles = [], studyUIDs } = args;

  commandline = commandline.replace(
    /<files>/,
    listFiles.map((file) => file.filepath).join(" ")
  );
  if (commandline.indexOf("<rootDir>") !== -1) {
    commandline = commandline.replace(
      /<rootDir>/,
      path.resolve(handleHomeRelative(params.rootDir))
    );
  }
  if (commandline.indexOf("<studyUIDs>") !== -1) {
    if (studyUIDs?.size) {
      commandline = commandline.replace(
        /<studyUIDs>/,
        Array.from(studyUIDs).join(" ")
      );
    } else {
      console.warn(
        "No study uid found, not running command",
        commandName,
        studyUIDs
      );
      return null;
    }
  }
  return commandline;
};

/**
 * Save files using stow service, using the given stow command (from params)
 *
 * @param {*} files files to be stored
 * @param {*} params
 */
export const storeFilesByStow = (stored, params = {}) => {
  const { stowCommands = [], notificationCommand, verbose = false } = params;
  const { listFiles, studyUIDs } = stored;

  const promises = [];
  for (const commandName of stowCommands) {
    const command = createCommandLine(stored, commandName, params);
    if (!command) {
      continue;
    }
    if (command.startsWith("mkdicomweb ")) {
      const cmd = [command.substring(11)];
      console.noQuiet("Running mkdicomweb command inline:", cmd);
      const result = mkdicomwebSpawn(cmd);
      result.then((message) => {
        console.noQuiet(message);
      });
      promises.push(result);
    } else {
      console.noQuiet("Store command", command);
      const commandPromise = execSpawn(command);
      promises.push(commandPromise);
    }
  }

  return Promise.allSettled(promises).then(() => {
    if (notificationCommand) {
      console.warn("Executing notificationCommand", notificationCommand);
      execSpawn(notificationCommand);
    }
    listFiles.forEach((item) => {
      const { filepath } = item;
      console.verbose("Unlinking", filepath);
      fs.unlink(filepath, () => null);
    });
    return listFiles.map((it) => it.filepath);
  });
};

export const storeFileInstance = (item, params = {}) => {
  console.verbose("storeFileInstance", item);
  const {
    instanceCommands = [
      ["mkdicomweb", "instance", "-v", "--multipart", "<files>"],
    ],
  } = params;
  if (instanceCommands.length > 1) {
    console.warn(
      "Executing more than 1 command not implemented yet:",
      instanceCommands
    );
  }
  const cmd = createCommandLine(
    { listFiles: [{ filepath: item }] },
    instanceCommands[0].slice(1),
    params
  );
  console.verbose("Instance cmd", cmd);
  return mkdicomwebSpawn(cmd);
};
