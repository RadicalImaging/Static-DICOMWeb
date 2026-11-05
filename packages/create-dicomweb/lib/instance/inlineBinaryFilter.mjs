import crypto from 'crypto';
import { constants } from 'dcmjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

const { TagHex, BULKDATA_VRS } = constants;

/**
 * Filter that converts to inline binary.
 */
export function inlineBinaryFilter(options = {}) {
  /**
   * Filter method: Called when a tag is being closed (popped from stack).
   * Replaces a binary Value with InlineBinary, then runs the base pop.
   */
  function pop(next) {
    const current = this.current;
    const dest = current?.dest;

    // Check if this tag has a Value array and is eligible for inline binary
    if (
      !Array.isArray(dest?.Value) ||
      !dest.Value.length ||
      !dest.Value.every(value => value instanceof ArrayBuffer || Buffer.isBuffer(value))
    ) {
      return next();
    }

    const buffer = Array.isArray(dest.Value)
      ? Buffer.concat(dest.Value.map(value => Buffer.from(value)))
      : dest.Value;
    const base64 = Buffer.from(buffer).toString('base64');
    delete dest.Value;
    dest.InlineBinary = base64;

    const result = next();
    delete result.Value;
    result.InlineBinary = base64;
    return result;
  }

  return {
    pop,
  };
}
