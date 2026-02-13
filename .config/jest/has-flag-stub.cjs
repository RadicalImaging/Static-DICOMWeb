'use strict';

/**
 * CommonJS stub for "has-flag" so that supports-color (and other CJS deps)
 * work when the hoisted has-flag is ESM-only v5. Use via Jest moduleNameMapper.
 */
function hasFlag(flag, argv) {
  argv = argv || process.argv;
  const prefix = flag.startsWith('-') ? '' : (flag.length === 1 ? '-' : '--');
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf('--');
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}

module.exports = hasFlag;
