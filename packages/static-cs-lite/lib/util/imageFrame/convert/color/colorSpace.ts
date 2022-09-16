import convertRGB  from "./convertRGB";
import convertPALETTECOLOR  from "./convertPALETTECOLOR";
import convertYBRFull422ByPixel  from "./convertYBRFull422ByPixel";
import convertYBRFull  from "./convertYBRFull";

/**
 * Convert pixel data with different Photometric Interpretation types to RGBA
 *
 * @param {ImageFrame} imageFrame
 * @param {Uint8ClampedArray} rgbaBuffer buffer result (this param is mutate)
 * @returns {void}
 */
function colorSpace(imageFrame, rgbaBuffer) {
  // convert based on the photometric interpretation
  const { photometricInterpretation } = imageFrame;

  switch (photometricInterpretation) {
    case "RGB":
    case "YBR_RCT":
    case "YBR_ICT":
      convertRGB(imageFrame, rgbaBuffer);
      break;
    case "PALETTE COLOR":
      convertPALETTECOLOR(imageFrame, rgbaBuffer);
      break;
    case "YBR_FULL_422":
      convertYBRFull422ByPixel(imageFrame, rgbaBuffer);
      break;
    case "YBR_FULL":
      convertYBRFull(imageFrame, rgbaBuffer);
      break;
    default:
      throw new Error(`No color space conversion for photometric interpretation ${photometricInterpretation}`);
  }
}

export default colorSpace;
