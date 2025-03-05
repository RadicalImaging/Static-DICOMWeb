const convertRGBColorByPixel = require("./convertRGBColorByPixel");
const convertRGBColorByPlane = require("./convertRGBColorByPlane");

/**
 * Convert pixel data with RGB (both pixel and plane) Photometric Interpretation to RGBA
 *
 * @param {ImageFrame} imageFrame
 * @param {Uint8ClampedArray} rgbaBuffer buffer result (this param is mutate)
 * @returns {void}
 */
function convertRGB(imageFrame, rgbaBuffer) {
  const { planarConfiguration, pixelData } = imageFrame;
  if (planarConfiguration === 0) {
    convertRGBColorByPixel(pixelData, rgbaBuffer);
  } else {
    convertRGBColorByPlane(pixelData, rgbaBuffer);
  }
}

module.exports = convertRGB;
