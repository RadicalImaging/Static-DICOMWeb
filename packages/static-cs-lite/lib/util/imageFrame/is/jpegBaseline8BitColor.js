function isJPEGBaseline8BitColor(imageFrame, _transferSyntax) {
  const { bitsAllocated, samplesPerPixel, transferSyntax: transferSyntaxFromFrame } = imageFrame;
  const transferSyntax = _transferSyntax || transferSyntaxFromFrame;
  let response = false;

  if (bitsAllocated === 8 && transferSyntax === "1.2.840.10008.1.2.4.50" && (samplesPerPixel === 3 || samplesPerPixel === 4)) {
    response = true;
  }

  return response;
}

module.exports = isJPEGBaseline8BitColor;
