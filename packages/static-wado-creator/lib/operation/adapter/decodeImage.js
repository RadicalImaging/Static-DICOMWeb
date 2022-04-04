const dicomCodec = require("@cornerstonejs/dicom-codec");
const getImageInfo = require("./getImageInfo");

async function decodeImage(imageFrame, dataset, transferSyntaxUid) {
  const imageInfo = getImageInfo(dataset);
  return dicomCodec.decode(imageFrame, imageInfo, transferSyntaxUid);
}

module.exports = decodeImage;
