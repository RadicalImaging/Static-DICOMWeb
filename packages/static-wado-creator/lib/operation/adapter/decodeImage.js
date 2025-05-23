const dicomCodec = require("@cornerstonejs/dicom-codec");
const getImageInfo = require("./getImageInfo");

function decodeImage(imageFrame, dataset, instance, transferSyntaxUid) {
  const imageInfo = getImageInfo(dataset, instance);
  if (imageFrame && !imageFrame.length) {
    imageFrame = new Uint8Array(imageFrame);
  }
  return dicomCodec.decode(imageFrame, imageInfo, transferSyntaxUid);
}

module.exports = decodeImage;
