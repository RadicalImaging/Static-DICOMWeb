/* eslint-disable no-plusplus, no-param-reassign */
const assertArrayDivisibility = require("../../../assertArrayDivisibility");

/**
 * Convert pixel data with YBR Full (by pixel) Photometric Interpretation to RGBA
 *
 * @param {ImageFrame} imageFrame
 * @param {Uint8ClampedArray} rgbaBuffer buffer result (this param is mutate)
 * @returns {void}
 */
function converter(imageFrame, rgbaBuffer) {
  if (!assertArrayDivisibility(imageFrame, 3, ["decodeRGB: ybrBuffer must not be undefined", "decodeRGB: ybrBuffer length must be divisble by 3"])) {
    return;
  }

  const numPixels = imageFrame.length / 3;

  let ybrIndex = 0;

  let rgbaIndex = 0;

  for (let i = 0; i < numPixels; i++) {
    const y = imageFrame[ybrIndex++];
    const cb = imageFrame[ybrIndex++];
    const cr = imageFrame[ybrIndex++];

    rgbaBuffer[rgbaIndex++] = y + 1.402 * (cr - 128); // red
    rgbaBuffer[rgbaIndex++] = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // green
    rgbaBuffer[rgbaIndex++] = y + 1.772 * (cb - 128); // blue
    rgbaBuffer[rgbaIndex++] = 255; // alpha
  }
}

module.exports = converter;
