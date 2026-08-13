/**
 * The decode/encode machinery lives in static-wado-creator, which already depends on
 * dicom-codec through @cornerstonejs/core; going through it keeps this package free of a
 * codec dependency of its own.
 *
 * The import is deferred rather than static because loading it initialises the codec modules,
 * and commands that never touch pixel data should not pay for that.
 *
 * @returns {Promise<{
 *   decodeFrameToBytes: Function,
 *   encodeFrameFromPixelData: Function,
 *   isUncompressedTransferSyntax: Function,
 *   JLS_LOSSLESS_TRANSFER_SYNTAX_UID: string
 * }>}
 */
export async function loadFrameCodec() {
  const imported = await import('@radicalimaging/static-wado-creator');
  const codec = imported.codecFrame ?? imported.default?.codecFrame;
  if (typeof codec?.decodeFrameToBytes !== 'function') {
    throw new Error(
      'static-wado-creator did not export codecFrame.decodeFrameToBytes; cannot decode frames'
    );
  }
  return codec;
}
