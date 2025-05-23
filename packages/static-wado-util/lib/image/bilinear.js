/**
 * Performs a bilinear scaling, both scaling up and scaling down.
 * @param src - src image frame to get map from
 * @param dest - dest image frame to write to
 * @returns destination data buffer
 */
function bilinear(src, dest) {
  const { rows: srcRows, columns: srcColumns, pixelData: srcData } = src;
  const { rows, columns, pixelData } = dest;

  const xSrc1Off = [];
  const xSrc2Off = [];
  const xFrac = [];

  // Precompute offsets
  for (let x = 0; x < columns; x++) {
    const xSrc = (x * (srcColumns - 1)) / (columns - 1);
    xSrc1Off[x] = Math.floor(xSrc);
    xSrc2Off[x] = Math.min(xSrc1Off[x] + 1, srcColumns - 1);
    xFrac[x] = xSrc - xSrc1Off[x];
    // console.log("x src info", x, xSrc, xFrac[x]);
  }

  for (let y = 0; y < rows; y++) {
    const ySrc = (y * (srcRows - 1)) / (rows - 1);
    const ySrc1Off = Math.floor(ySrc) * srcColumns;
    // Get the second offset, but duplicate the last row so the lookup works
    const ySrc2Off = Math.min(
      ySrc1Off + srcColumns,
      (srcRows - 1) * srcColumns,
    );
    const yFrac = ySrc - Math.floor(ySrc);
    const yFracInv = 1 - yFrac;
    const yOff = y * columns;
    // console.log("yfrac", y, ySrc, yFrac, yFracInv);

    for (let x = 0; x < columns; x++) {
      // TODO - put the pXY into the data calculation
      const p00 = srcData[ySrc1Off + xSrc1Off[x]];
      const p10 = srcData[ySrc1Off + xSrc2Off[x]];
      const p01 = srcData[ySrc2Off + xSrc1Off[x]];
      const p11 = srcData[ySrc2Off + xSrc2Off[x]];
      const xFracInv = 1 - xFrac[x];

      //   console.log("bilinear for", x,y, "from", ySrc1Off + xSrc1Off[x], ySrc1Off + xSrc2Off[x], ySrc2Off + xSrc1Off[x], ySrc2Off + xSrc2Off[x]);
      //   console.log("values", p00, p10, p01, p11);
      //   console.log("fractions", xFracInv, xFrac[x], yFracInv, yFrac);

      pixelData[yOff + x] =
        (p00 * xFracInv + p10 * xFrac[x]) * yFracInv +
        (p01 * xFracInv + p11 * xFrac[x]) * yFrac;
    }
  }
  return pixelData;
}

/** Handle replicate scaling.  Use this function for samplesPerPixel>1 */
function replicate(src, dest) {
  const {
    rows: srcRows,
    columns: srcColumns,
    pixelData: srcData,
    samplesPerPixel = 1,
  } = src;
  const { rows, columns, pixelData } = dest;

  const xSrc1Off = [];

  // Precompute offsets
  for (let x = 0; x < columns; x++) {
    const xSrc = (x * (srcColumns - 1)) / (columns - 1);
    xSrc1Off[x] = Math.floor(xSrc) * samplesPerPixel;
  }

  for (let y = 0; y < rows; y++) {
    const ySrc = (y * (srcRows - 1)) / (rows - 1);
    const ySrc1Off = Math.floor(ySrc) * srcColumns * samplesPerPixel;
    const yOff = y * columns;

    for (let x = 0; x < columns; x++) {
      for (let sample = 0; sample < samplesPerPixel; sample++) {
        pixelData[yOff + x + sample] = srcData[ySrc1Off + xSrc1Off[x] + sample];
      }
    }
  }
  return pixelData;
}

module.exports = {
  bilinear,
  default: bilinear,
  replicate,
};
