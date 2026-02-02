/* eslint-disable import/prefer-default-export */
import fs from 'fs';
import path from 'path';
import childProcess from 'node:child_process';
import {
  extractMultipart,
  uint8ArrayToString,
  execSpawn,
  handleHomeRelative,
  logger,
} from '@radicalimaging/static-wado-util';
import { mkdicomwebSpawn } from './util/serverSpawn.mjs';

const { webserverLog } = logger;

const createCommandLine = (args, commandName, params) => {
  let commandline = Array.isArray(commandName) ? commandName.join(' ') : commandName;
  const { listFiles = [], studyUIDs } = args;

  commandline = commandline.replace(/<files>/, listFiles.map(file => file.filepath).join(' '));
  if (commandline.indexOf('<rootDir>') !== -1) {
    commandline = commandline.replace(
      /<rootDir>/,
      path.resolve(handleHomeRelative(params.rootDir))
    );
  }
  if (commandline.indexOf('<studyUIDs>') !== -1) {
    if (studyUIDs?.size) {
      commandline = commandline.replace(/<studyUIDs>/, Array.from(studyUIDs).join(' '));
    } else {
      webserverLog.warn('No study uid found, not running command', commandName, studyUIDs);
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
export const storeFilesByStow = async (stored, params = {}, hashStudyUidPath) => {
  const { stowCommands = [], notificationCommand, verbose = false } = params;
  const { listFiles, studyUIDs } = stored;

  for (const commandName of stowCommands) {
    const command = createCommandLine(stored, commandName, params);
    if (!command) {
      continue;
    }
    if (command.startsWith('mkdicomweb ')) {
      const cmd = [command.substring(11)];
      webserverLog.info('Running mkdicomweb command inline:', cmd);
      const result = await mkdicomwebSpawn(cmd);
    } else {
      webserverLog.info('Store command', command);
      await execSpawn(command);
    }
  }
};

export const storeFileInstance = async (item, params = {}, { hashStudyUidPath }) => {
  webserverLog.debug('storeFileInstance', item, hashStudyUidPath ? 'hash directory' : '');
  const {
    instanceCommands = [
      [
        'mkdicomweb',
        'instance',
        '--no-thumb',
        '--multipart',
        '--delete-input',
        '--delete-failed',
        '--verbose',
        '<files>',
        ...(hashStudyUidPath ? ['--hash-study-uid-path'] : []),
      ],
    ],
  } = params;
  if (instanceCommands.length > 1) {
    webserverLog.warn('Executing more than 1 command not implemented yet:', instanceCommands);
  }
  const cmd = createCommandLine(
    { listFiles: [{ filepath: item }] },
    instanceCommands[0].slice(1),
    params
  );
  webserverLog.debug('Instance cmd', cmd);
  try {
    return await mkdicomwebSpawn(cmd);
  } catch (e) {
    webserverLog.warn('Unable to store file instance', e);
    return null;
  }
};
