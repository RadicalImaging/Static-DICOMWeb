/**
 * Halved size of a spatial axis. Rounding up rather than down keeps the last row, column or
 * slice of an odd sized axis instead of dropping it - a level that silently loses the edge of
 * the volume would not be a representation of the same volume.
 * @param {number} size - Axis size at the finer level
 * @returns {number} - Axis size at the next coarser level
 */
export function halveSize(size) {
  return Math.max(1, Math.ceil(size / 2));
}

/**
 * Reduces one or two source planes into a single coarser plane by a box average over the axes
 * being halved.
 *
 * Which axes halve is a per-level decision, because a single scalar downsample factor is only
 * right for isotropic voxels. On a 5mm-slice series the through-plane axis is already five times
 * coarser than in-plane, so halving it alongside x and y preserves the anisotropy all the way
 * down and produces a coarse level with too few slices to reform. The caller decides from the
 * spacing; this applies whatever it decided.
 *
 * `halveZ` is what determines how many planes an invocation consumes: two when z halves, one
 * when it does not. So a 2x2x1 step passes every plane through at reduced in-plane resolution.
 *
 * All contributing samples carry equal weight, which is why this cannot be expressed as
 * "reduce each plane in-plane, then average the two results": once padding removes some of the
 * eight, per-plane reduction would weight the surviving samples by which plane they came from.
 *
 * Averaging is done on true pixel values via the model, and the result is packed back, so
 * BitsStored < BitsAllocated and signed data come out right. Samples the model calls padding
 * are excluded; a destination voxel whose whole box was padding is written as padding rather
 * than as an invented value.
 *
 * A model with `isLabelMap` takes the first non-zero sample of the box instead of averaging it.
 * Segment identifiers are not quantities: averaging segments 1 and 3 yields segment 2, which
 * is a different structure in a place neither of them occupies. Picking any occupied corner
 * keeps every coarse voxel a label that was really there, and keeps a segment visible at
 * coarse resolution rather than diluting it towards its neighbours.
 *
 * @param {Object} src - Source description
 * @param {ArrayBufferView[]} src.planes - One or two planes, each columns*rows samples
 * @param {number} src.columns - Source columns
 * @param {number} src.rows - Source rows
 * @param {Object} src.model - PixelValueModel for these samples
 * @param {boolean} [src.halveX=true] - Whether x is being halved
 * @param {boolean} [src.halveY=true] - Whether y is being halved
 * @param {Object} dest - Destination description
 * @param {ArrayBufferView} dest.pixelData - Destination plane, destColumns*destRows samples
 * @param {number} dest.columns - Destination columns, halveSize(src.columns) when x halves
 * @param {number} dest.rows - Destination rows, halveSize(src.rows) when y halves
 * @returns {ArrayBufferView} - dest.pixelData
 */
export function boxAverageStep(src, dest) {
  const { planes, columns: srcColumns, rows: srcRows, model, halveX = true, halveY = true } = src;
  const { pixelData, columns, rows } = dest;

  const stepX = halveX ? 2 : 1;
  const stepY = halveY ? 2 : 1;

  const isLabelMap = model?.isLabelMap === true;
  const needsModel = !!model && (!model.isIdentity || model.hasPadding || isLabelMap);
  const normalize = needsModel ? model.normalize : undefined;
  const pack = needsModel ? model.pack : undefined;
  const isPadding = needsModel && model.hasPadding ? model.isPadding : undefined;
  const packedPadding = isPadding ? model.pack(model.paddingValue) : 0;

  for (let dy = 0; dy < rows; dy++) {
    const sy0 = dy * stepY;
    const sy1 = Math.min(sy0 + stepY, srcRows);
    const destRowOff = dy * columns;

    for (let dx = 0; dx < columns; dx++) {
      const sx0 = dx * stepX;
      const sx1 = Math.min(sx0 + stepX, srcColumns);
      let sum = 0;
      let count = 0;
      let label = 0;

      for (let p = 0; p < planes.length; p++) {
        const plane = planes[p];
        for (let sy = sy0; sy < sy1; sy++) {
          const rowOff = sy * srcColumns;
          for (let sx = sx0; sx < sx1; sx++) {
            const raw = plane[rowOff + sx];
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
              // First occupied voxel wins; zero is background, so it never displaces a label
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
      }

      if (count === 0) {
        pixelData[destRowOff + dx] = packedPadding;
        continue;
      }
      if (isLabelMap) {
        pixelData[destRowOff + dx] = pack(label);
        continue;
      }
      const mean = Math.round(sum / count);
      pixelData[destRowOff + dx] = needsModel ? pack(mean) : mean;
    }
  }

  return pixelData;
}

/**
 * The all-axes case of {@link boxAverageStep}: a 2x2x2 average of one or two planes.
 * @param {Object} src - Source description, as boxAverageStep minus the halve flags
 * @param {Object} dest - Destination description
 * @returns {ArrayBufferView} - dest.pixelData
 */
export function boxAverage2x2x2(src, dest) {
  return boxAverageStep({ ...src, halveX: true, halveY: true }, dest);
}
