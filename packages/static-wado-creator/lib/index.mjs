import mkdicomwebConfig from './mkdicomwebConfig.js';
import StaticWado from './StaticWado.js';
import programIndex from './program/index.js';
import createMain from './createMain.js';
import deleteMain from './deleteMain.js';
import adaptProgramOpts from './util/adaptProgramOpts.js';
import { uids } from '@radicalimaging/static-wado-util';
import videoWriterFactory from './writer/VideoWriter.js';

const { configureProgram } = programIndex;

/** @param {string|object} uid - Transfer syntax UID string or dcmjs-like dataset */
export function isVideoTransferSyntaxUid(uid) {
  return videoWriterFactory.isVideo(uid);
}

/** @param {string|object} uid */
export function getVideoFileExtensionForTransferSyntaxUid(uid) {
  return videoWriterFactory.getVideoFileExtensionForTransferSyntaxUid(uid);
}

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = createMain;
StaticWado.deleteMain = deleteMain;
StaticWado.adaptProgramOpts = adaptProgramOpts;
StaticWado.configureProgram = configureProgram;

export default StaticWado;
export { uids, StaticWado };
