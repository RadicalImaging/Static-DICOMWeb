/* eslint-disable no-plusplus, no-param-reassign */
const assertArrayDivisibility = require("../../../assertArrayDivisibility");

/**
 * Convert pixel data with YBR Full 422 (by pixel) Photometric Interpretation to RGBA
 *
 * @param {ImageFrame} imageFrame
 * @param {Uint8ClampedArray} rgbaBuffer buffer result (this param is mutate)
 * @returns {void}
 */
function converter(imageFrame, rgbaBuffer) {
  if (!assertArrayDivisibility(imageFrame, 2, ["decodeRGB: ybrBuffer must not be undefined", "decodeRGB: ybrBuffer length must be divisble by 2"])) {
    return;
  }

  const numPixels = imageFrame.length / 2;

  let ybrIndex = 0;

  let rgbaIndex = 0;

  for (let i = 0; i < numPixels; i += 2) {
    const y1 = imageFrame[ybrIndex++];
    const y2 = imageFrame[ybrIndex++];
    const cb = imageFrame[ybrIndex++];
    const cr = imageFrame[ybrIndex++];

    rgbaBuffer[rgbaIndex++] = y1 + 1.402 * (cr - 128); // red
    rgbaBuffer[rgbaIndex++] = y1 - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
    rgbaBuffer[rgbaIndex++] = y1 + 1.772 * (cb - 128); // blue
    rgbaBuffer[rgbaIndex++] = 255; // alpha

    rgbaBuffer[rgbaIndex++] = y2 + 1.402 * (cr - 128); // red
    rgbaBuffer[rgbaIndex++] = y2 - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
    rgbaBuffer[rgbaIndex++] = y2 + 1.772 * (cb - 128); // blue
    rgbaBuffer[rgbaIndex++] = 255; // alpha
  }
}

module.exports = converter;
