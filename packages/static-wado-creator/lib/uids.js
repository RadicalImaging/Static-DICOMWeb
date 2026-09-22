// Re-exported through CommonJS on purpose. The rest of this package is CommonJS and
// require()s @radicalimaging/static-wado-util, but that package is ESM. If the .mjs entry
// point also imports it directly, the util package joins the entry's ESM graph and Bun
// treats it as an async module for the duration of that graph's evaluation, so every
// require() of it from this package throws "require() async module ... is unsupported".
// Reaching it through a CommonJS hop keeps it out of the ESM graph.
const { uids } = require('@radicalimaging/static-wado-util');

module.exports = uids;
