/**
 * Jest setup: configure console.verbose and console.noQuiet before tests run.
 * Code under test (e.g. FileDicomWebWriter, stowMain, parseDicomJsonErrors) may
 * call these; they must be defined by createVerboseLog from static-wado-util.
 */
import { createVerboseLog } from '@radicalimaging/static-wado-util';

createVerboseLog(false, { quiet: false });
