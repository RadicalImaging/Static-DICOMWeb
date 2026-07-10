import mkdicomwebConfig from './mkdicomwebConfig.js';
import StaticWado from './StaticWado.js';
import programIndex from './program/index.js';
import createMain from './createMain.js';
import deleteMain from './deleteMain.js';
import adaptProgramOpts from './util/adaptProgramOpts.js';
// Import uids via its subpath rather than the package root: mixing an ESM
// import of the package root with the CJS require() calls in the lib/*.js
// files makes Bun treat the root as an async module and fail the require().
import uids from '@radicalimaging/static-wado-util/uids.mjs';

const { configureProgram } = programIndex;

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = createMain;
StaticWado.deleteMain = deleteMain;
StaticWado.adaptProgramOpts = adaptProgramOpts;
StaticWado.configureProgram = configureProgram;

export default StaticWado;
export { uids, StaticWado };
