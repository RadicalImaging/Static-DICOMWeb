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
    const ySrc2Off = Math.min(ySrc1Off + srcColumns, (srcRows - 1) * srcColumns);
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
        (p00 * xFracInv + p10 * xFrac[x]) * yFracInv + (p01 * xFracInv + p11 * xFrac[x]) * yFrac;
    }
  }
  return pixelData;
}

/** Handle replicate scaling.  Use this function for samplesPerPixel>1 */
function replicate(src, dest) {
  const { rows: srcRows, columns: srcColumns, pixelData: srcData, samplesPerPixel = 1 } = src;
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

/**
 * Reduces src into dest by averaging each source box that maps to a destination pixel.
 *
 * This is the band-limited reduction: every source sample contributes to exactly one
 * destination sample. `replicate` picks a single source sample per destination pixel
 * instead, which aliases - it folds high frequency content down into the displayed band,
 * fabricating structure rather than blurring it.
 *
 * Box boundaries are derived from the size ratio, so non-integer reductions work too;
 * every box is at least one sample wide. Only reduction is supported - when dest is
 * larger than src the boxes degenerate to single samples and this replicates. Use
 * bilinear for upscaling.
 *
 * Pass `src.pixelValueModel` (see createPixelValueModel) to average the true pixel values
 * rather than the stored words, and to leave padding out of the average. Without it the
 * stored words are averaged directly, which is only correct when BitsStored equals
 * BitsAllocated and nothing in the image is padding.
 *
 * A model with `isLabelMap` reduces by taking the first non-zero sample of each box instead of
 * averaging it: label values identify segments, so their mean is a different segment somewhere
 * neither of them is. Whichever occupied corner wins is arbitrary and does not matter - what
 * matters is that the reduced sample is a label that was really there.
 *
 * @param src - src image frame with rows, columns, pixelData, optional samplesPerPixel
 *   and optional pixelValueModel
 * @param dest - dest image frame with rows, columns and pixelData to write to
 * @returns destination data buffer
 */
function boxAverage(src, dest) {
  const {
    rows: srcRows,
    columns: srcColumns,
    pixelData: srcData,
    samplesPerPixel = 1,
    pixelValueModel: model,
  } = src;
  const { rows, columns, pixelData } = dest;

  const isLabelMap = model?.isLabelMap === true;
  const needsModel = !!model && (!model.isIdentity || model.hasPadding || isLabelMap);
  const normalize = needsModel ? model.normalize : undefined;
  const pack = needsModel ? model.pack : undefined;
  const isPadding = needsModel && model.hasPadding ? model.isPadding : undefined;
  // Boxes that are entirely padding stay padding: writing an averaged value there would
  // invent image content where the source declared there is none.
  const packedPadding = isPadding ? model.pack(model.paddingValue) : 0;

  // Precompute the source column span of every destination column
  const xStart = new Int32Array(columns);
  const xEnd = new Int32Array(columns);
  for (let x = 0; x < columns; x++) {
    const start = Math.floor((x * srcColumns) / columns);
    const end = Math.floor(((x + 1) * srcColumns) / columns);
    xStart[x] = Math.min(start, srcColumns - 1);
    xEnd[x] = Math.min(Math.max(end, xStart[x] + 1), srcColumns);
  }

  for (let y = 0; y < rows; y++) {
    const yStart = Math.min(Math.floor((y * srcRows) / rows), srcRows - 1);
    const yEnd = Math.min(Math.max(Math.floor(((y + 1) * srcRows) / rows), yStart + 1), srcRows);
    const destRowOff = y * columns * samplesPerPixel;

    for (let x = 0; x < columns; x++) {
      const x0 = xStart[x];
      const x1 = xEnd[x];
      const destOff = destRowOff + x * samplesPerPixel;

      for (let sample = 0; sample < samplesPerPixel; sample++) {
        let sum = 0;
        let count = 0;
        let label = 0;
        for (let sy = yStart; sy < yEnd; sy++) {
          const srcRowOff = sy * srcColumns * samplesPerPixel;
          for (let sx = x0; sx < x1; sx++) {
            const raw = srcData[srcRowOff + sx * samplesPerPixel + sample];
            if (!needsModel) {
              sum += raw;
              count += 1;
              continue;
            }
            const value = normalize(raw);
            if (isPadding && isPadding(value)) {
              continue;
            }
            if (isLabelMap) {
              // First occupied sample wins; zero is background, so it never displaces a label
              if (label === 0 && value !== 0) {
                label = value;
              }
              count += 1;
              continue;
            }
            sum += value;
            count += 1;
          }
        }
        if (count === 0) {
          pixelData[destOff + sample] = packedPadding;
          continue;
        }
        if (isLabelMap) {
          pixelData[destOff + sample] = pack(label);
          continue;
        }
        // Integer typed arrays truncate on assignment, so round here rather than
        // biasing every reduced sample downwards.
        const mean = Math.round(sum / count);
        pixelData[destOff + sample] = needsModel ? pack(mean) : mean;
      }
    }
  }
  return pixelData;
}

module.exports = {
  bilinear,
  default: bilinear,
  replicate,
  boxAverage,
};
