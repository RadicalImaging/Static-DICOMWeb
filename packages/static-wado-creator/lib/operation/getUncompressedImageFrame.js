function getUncompressedImageFrame(dataSet, attr, frame, uncompressedFrameSize) {
  const start = attr.dataOffset + frame * uncompressedFrameSize;
  const binaryValue = dataSet.byteArray.slice(start, start + uncompressedFrameSize);
  return binaryValue;
}

module.exports = getUncompressedImageFrame;
