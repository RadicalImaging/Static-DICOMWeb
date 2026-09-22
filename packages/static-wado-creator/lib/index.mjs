import mkdicomwebConfig from './mkdicomwebConfig.js';
import StaticWado from './StaticWado.js';
import programIndex from './program/index.js';
import createMain from './createMain.js';
import deleteMain from './deleteMain.js';
import adaptProgramOpts from './util/adaptProgramOpts.js';
import codecFrame from './operation/adapter/codecFrame.js';
import uids from './uids.js';

const { configureProgram } = programIndex;

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = createMain;
StaticWado.deleteMain = deleteMain;
StaticWado.adaptProgramOpts = adaptProgramOpts;
StaticWado.configureProgram = configureProgram;

export default StaticWado;
// codecFrame is the frame level decode/encode facade over dicom-codec, so packages that
// already depend on this one can transcode frames without adding a codec dependency.
export { uids, StaticWado, codecFrame };
