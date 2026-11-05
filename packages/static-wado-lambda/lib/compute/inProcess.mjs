import { transcodeFrame } from '@dcmjs/commands/pixel';

/**
 * The in-process compute implementation (PRX-IMP-28), for the local server and the tests. The
 * AWS implementation (a Lambda `Invoke`) has the same methods.
 */
export const inProcessCompute = {
  /**
   * Converts one frame between transfer syntaxes.
   * @param {{frame: Uint8Array, imageInfo: Object, sourceUid: string, targetUid: string}} options
   * @returns {Promise<Uint8Array>}
   */
  encode: ({ frame, imageInfo, sourceUid, targetUid }) =>
    transcodeFrame(frame, imageInfo, sourceUid, targetUid),
};

export default inProcessCompute;
