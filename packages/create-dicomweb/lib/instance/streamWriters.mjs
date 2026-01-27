/**
 * Shared writer functions for writing data to streams via StreamInfo.
 * StreamInfo provides writeBinaryValue (with backpressure and extend) and end().
 */

/**
 * Creates a writer function for bulkdata that can be bound with the data array.
 * Uses streamInfo.writeBinaryValue (StreamInfo handles backpressure and extend).
 *
 * @param {Array<ArrayBuffer|Buffer>} dataArray - Array of ArrayBuffer or Buffer values to write
 * @returns {Function} - Writer function that takes (stream, streamInfo) and writes the bulkdata
 */
export function createBulkdataWriter(dataArray) {
  return (stream, streamInfo) => {
    return (async () => {
      const bytesWritten = await streamInfo.writeBinaryValue(dataArray);
      if (bytesWritten === 0) {
        throw new Error('Bulkdata wrote 0 bytes - data array must contain binary content');
      }
    })();
  };
}

/**
 * Creates a writer function for frames that can be bound with the frame data.
 * Uses streamInfo.writeBinaryValue. Can be extended with further writeBinaryValue
 * calls when using a shared StreamInfo for streaming frames.
 *
 * @param {*} frameData - The frame data to write (can be nested arrays, ArrayBuffer, Buffer, TypedArray)
 * @returns {Function} - Writer function that takes (stream, streamInfo) and writes the frame data
 */
export function createFrameWriter(frameData) {
  return (stream, streamInfo) => {
    const frame = Array.isArray(frameData) ? frameData : [frameData];
    return (async () => {
      const bytesWritten = await streamInfo.writeBinaryValue(frame);
      if (bytesWritten === 0) {
        throw new Error('Frame wrote 0 bytes - frame data must contain binary content');
      }
    })();
  };
}
