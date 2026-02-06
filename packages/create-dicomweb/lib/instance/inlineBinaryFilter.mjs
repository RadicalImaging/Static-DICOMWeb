import crypto from 'crypto';
import { constants } from 'dcmjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

const { TagHex, BULKDATA_VRS } = constants;


/**
 * Filter that converts to inline binary.
 */
export function inlineBinaryFilter(options = {}) {
 
  /**
   * Filter method: Called when a tag is being closed (popped from stack)
   * Determines if the tag should be written as bulkdata and performs the write
   */
  function pop(next, result) {
    // Access the current tag context
    const current = this.current;
    const currentTag = current?.tag;
    const currentVR = current?.vr;
    const level = current?.level ?? 0;
    const dest = current?.dest;

    // Check if this tag has a Value array and is eligible for bulkdata
    if (
      !Array.isArray(dest?.Value) ||
      !dest.Value.length ||
      !dest.Value.every(value => value instanceof ArrayBuffer || Buffer.isBuffer(value))
    ) {
      return next(result);
    }

    const buffer = Array.isArray(dest.Value)
      ? Buffer.concat(dest.Value.map(value => Buffer.from(value)))
      : dest.Value;
    const base64 = Buffer.from(buffer).toString('base64');
    delete dest.Value;
    dest.InlineBinary = base64;

    // Always call next with the result (synchronously)
    return next(result);
  }

  return {
    pop,
  };
}
