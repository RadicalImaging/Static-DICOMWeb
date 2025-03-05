function isColorImage(imageFrame) {
  const { photometricInterpretation } = imageFrame;

  return (
    photometricInterpretation === "RGB" ||
    photometricInterpretation === "PALETTE COLOR" ||
    photometricInterpretation === "YBR_FULL" ||
    photometricInterpretation === "YBR_FULL_422" ||
    photometricInterpretation === "YBR_PARTIAL_422" ||
    photometricInterpretation === "YBR_PARTIAL_420" ||
    photometricInterpretation === "YBR_RCT" ||
    photometricInterpretation === "YBR_ICT"
  );
}

module.exports = isColorImage;
