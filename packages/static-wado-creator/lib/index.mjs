import mkdicomwebConfig from './mkdicomwebConfig.js';
import StaticWado from './StaticWado.js';
import programIndex from './program/index.js';
import createMain from './createMain.js';
import deleteMain from './deleteMain.js';
import adaptProgramOpts from './util/adaptProgramOpts.js';
import uids from './model/uids.js';

const { configureProgram } = programIndex;

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = createMain;
StaticWado.deleteMain = deleteMain;
StaticWado.adaptProgramOpts = adaptProgramOpts;
StaticWado.configureProgram = configureProgram;

export default StaticWado;
export { uids, StaticWado };
