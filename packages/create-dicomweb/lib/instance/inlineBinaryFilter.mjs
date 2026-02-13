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
   * When converting to InlineBinary, performs the default pop logic and returns
   * without calling next, so the released dcmjs base pop (which logs when
   * InlineBinary is set) is never run.
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

    // Default pop behavior without calling next (avoids dcmjs InlineBinary log)
    const result = current.pop?.() ?? current.dest;
    if (result.Value === null) {
      result.Value = [];
    } else if (
      result.Value?.length === 1 &&
      (result.Value[0] === null || result.Value[0] === undefined)
    ) {
      result.Value = [];
    }
    this.current = current.parent;
    return result;
  }

  return {
    pop,
  };
}
