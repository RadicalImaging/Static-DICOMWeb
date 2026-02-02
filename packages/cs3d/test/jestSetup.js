/**
 * Jest setup: register console.verbose and console.noQuiet before tests run.
 * Tests (e.g. cs3d.jest.js) call these; same contract as createVerboseLog in static-wado-util.
 */
function registerConsoleVerbose() {
  const verbose = false;
  const quiet = false;
  console.verbose = (...args) => {
    if (!verbose) return;
    console.log(...args);
  };
  console.quiet = quiet;
  console.noQuiet = (...args) => {
    if (quiet) return;
    console.log(...args);
  };
}

registerConsoleVerbose();
