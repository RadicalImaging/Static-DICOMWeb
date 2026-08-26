import mkdicomwebConfig from './mkdicomwebConfig.js';
import StaticWado from './StaticWado.js';
import programIndex from './program/index.js';
import createMain from './createMain.js';
import deleteMain from './deleteMain.js';
import adaptProgramOpts from './util/adaptProgramOpts.js';
import { createRequire } from 'module';

// static-wado-util is ESM (lib/index.ts), while 23 files in this package reach it through a CJS
// require(). Importing it here as ESM too pulls it into this module's async graph, and Bun >= 1.3
// then rejects every one of those requires with "require() async module ... is unsupported". Loading
// it through createRequire keeps it out of the ESM graph, so the CJS requires resolve synchronously.
const require = createRequire(import.meta.url);
const { uids } = require('@radicalimaging/static-wado-util');

const { configureProgram } = programIndex;

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = createMain;
StaticWado.deleteMain = deleteMain;
StaticWado.adaptProgramOpts = adaptProgramOpts;
StaticWado.configureProgram = configureProgram;

export default StaticWado;
export { uids, StaticWado };
