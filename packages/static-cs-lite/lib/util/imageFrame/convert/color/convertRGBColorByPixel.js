/* eslint-disable no-plusplus, no-param-reassign */
const assertArrayDivisibility = require("../../../assertArrayDivisibility");

/**
 * Convert pixel data with RGB (by pixel) Photometric Interpretation to RGBA
 *
 * @param {ImageFrame} imageFrame
 * @param {Uint8ClampedArray} rgbaBuffer buffer result (this param is mutate)
 * @returns {void}
 */
function converter(imageFrame, rgbaBuffer) {
  if (!assertArrayDivisibility(imageFrame, 3, ["decodeRGB: rgbBuffer must not be undefined", "decodeRGB: rgbBuffer length must be divisble by 3"])) {
    return;
  }

  const numPixels = imageFrame.length / 3;

  let rgbIndex = 0;

  let rgbaIndex = 0;

  for (let i = 0; i < numPixels; i++) {
    rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // red
    rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // green
    rgbaBuffer[rgbaIndex++] = imageFrame[rgbIndex++]; // blue
    rgbaBuffer[rgbaIndex++] = 255; // alpha
  }
}

module.exports = converter;
