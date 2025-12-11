/**
 * Convert image from the given canvas to buffer object.
 *
 * @param {*} canvas that holds image to be converted.
 * @param {*} imageType target imageType.
 * @returns Buffer object
 */
function canvasImageToBuffer(canvas, imageType = 'image/jpeg', quality = 1) {
  let result;
  if (imageType === 'image/jpeg' || imageType === 'image/png') {
    const dataUrl = canvas.toDataURL(imageType, quality);
    const base64Data = dataUrl.replace(/^data:image\/(jpeg|png);base64,/, '');
    result = Buffer.from(base64Data, 'base64');
  } else {
    console.warn(`Can't convert canvas to image type of ${imageType}`);
  }
  return result;
}

module.exports = canvasImageToBuffer;
