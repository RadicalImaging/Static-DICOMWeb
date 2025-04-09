const convertYBRFullByPixel = require("./convertYBRFullByPixel");
const convertYBRFullByPlane = require("./convertYBRFullByPlane");

/**
 * Convert pixel data with YBR Full (both pixel and plane) Photometric Interpretation to RGBA
 *
 * @param {ImageFrame} imageFrame
 * @param {Uint8ClampedArray} rgbaBuffer buffer result (this param is mutate)
 * @returns {void}
 */
function convertYBRFull(imageFrame, rgbaBuffer) {
  const { planarConfiguration, pixelData } = imageFrame;

  if (planarConfiguration === 0) {
    convertYBRFullByPixel(pixelData, rgbaBuffer);
  } else {
    convertYBRFullByPlane(pixelData, rgbaBuffer);
  }
}

module.exports = convertYBRFull;
