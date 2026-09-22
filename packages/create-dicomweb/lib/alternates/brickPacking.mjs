/**
 * Rows are `y * extentZ + z`, so a row's left neighbour is (x-1, y, z) and its above
 * neighbour is (x, y, z-1). This puts the through-plane axis on the fast vertical direction,
 * which is what lets the JPEG-LS MED predictor exploit inter-slice correlation.
 */
export const BRICK_ORDER_Z_MINOR = 'z-minor';

/**
 * Rows are `z * extentY + y`, so the above neighbour is (x, y-1, z): in-plane vertical
 * correlation instead of through-plane. Better for thick slices, where neighbouring slices
 * are less alike than neighbouring rows.
 */
export const BRICK_ORDER_PLANE_MAJOR = 'plane-major';

export const BRICK_ORDERS = Object.freeze([BRICK_ORDER_Z_MINOR, BRICK_ORDER_PLANE_MAJOR]);

/**
 * Normalises a brick extent to [x, y, z].
 *
 * A scalar means a cube, which is what a caller working with a uniform brick size passes.
 * Bricks are no longer necessarily cubic - a coarse level small enough to be one object gets a
 * brick the shape of the level, and an edge brick is stored at its true extent - so everything
 * downstream works from the triple.
 *
 * @param {number|number[]} extent - Cube edge length, or [x, y, z]
 * @returns {number[]} - [x, y, z]
 */
export function toExtent(extent) {
  return Array.isArray(extent) ? extent : [extent, extent, extent];
}

/**
 * Row index of (y, z) in the packed brick image.
 *
 * Either ordering leaves the above neighbour spatially adjacent for all but one row in every
 * `extentZ` (or `extentY`); at the wrap it falls back to the previous value of the slower axis,
 * which is a real voxel too, just a less close one.
 *
 * @param {string} order - BRICK_ORDER_Z_MINOR or BRICK_ORDER_PLANE_MAJOR
 * @param {number} y - Y within the brick
 * @param {number} z - Z within the brick
 * @param {number|number[]} extent - Brick extent, cube edge length or [x, y, z]
 * @returns {number} - Row index in the packed image
 */
export function brickRowIndex(order, y, z, extent) {
  const [, ey, ez] = toExtent(extent);
  return order === BRICK_ORDER_PLANE_MAJOR ? z * ey + y : y * ez + z;
}

/**
 * Dimensions of the 2D image a brick is packed into: as wide as the brick's x extent, as tall
 * as its y and z extents multiplied.
 *
 * Both orderings give the same dimensions - they differ only in which of y and z is the fast
 * axis down the rows - so a reader needs the extent and the order, and gets the image shape
 * from the extent alone.
 *
 * @param {number|number[]} extent - Brick extent, cube edge length or [x, y, z]
 * @returns {{columns: number, rows: number}}
 */
export function packedBrickDimensions(extent) {
  const [ex, ey, ez] = toExtent(extent);
  return { columns: ex, rows: ey * ez };
}

/** Number of samples in a packed brick of this extent. */
export function packedBrickLength(extent) {
  const { columns, rows } = packedBrickDimensions(extent);
  return columns * rows;
}

/**
 * Packs one brick out of a z-slab into a single 2D image.
 *
 * The slab holds whole x-y planes for a contiguous run of z, which is how the pyramid produces
 * data; this copies the (x, y) window for each z into the row the ordering assigns it. Rows are
 * copied whole rather than sample by sample, so packing a level costs roughly one memcpy per
 * (y, z) pair.
 *
 * There is no padding: the brick is stored at exactly `extent`, so an edge brick is a smaller
 * image rather than a full one with zeros in it. Padding would compress to almost nothing but
 * still costs a full-size decode buffer and the decode work to fill it, and a reader has the
 * extent from the manifest either way.
 *
 * @param {Object} params - Packing parameters
 * @param {ArrayBufferView} params.slab - Source slab, slabDepth planes of slabRows*slabColumns
 * @param {number} params.slabColumns - Columns in the slab (the level's x size)
 * @param {number} params.slabRows - Rows in the slab (the level's y size)
 * @param {number} params.x0 - Brick origin along x
 * @param {number} params.y0 - Brick origin along y
 * @param {number[]} params.extent - True extent [x, y, z] of this brick
 * @param {string} params.order - Row ordering
 * @param {ArrayBufferView} params.out - Destination, at least packedBrickLength(extent) samples
 * @returns {ArrayBufferView} - The packed brick, a subarray of params.out of exactly the
 *   packed length, so a caller can hand it straight to an encoder
 */
export function packBrickFromSlab({ slab, slabColumns, slabRows, x0, y0, extent, order, out }) {
  const [ex, ey, ez] = extent;
  const packed = out.subarray(0, packedBrickLength(extent));

  for (let z = 0; z < ez; z++) {
    const planeOff = z * slabRows * slabColumns;
    for (let y = 0; y < ey; y++) {
      const srcOff = planeOff + (y0 + y) * slabColumns + x0;
      const destOff = brickRowIndex(order, y, z, extent) * ex;
      packed.set(slab.subarray(srcOff, srcOff + ex), destOff);
    }
  }

  return packed;
}

/**
 * Reads one voxel out of a packed brick. Used to verify a packing round-trips.
 * @param {ArrayBufferView} packed - Packed brick image
 * @param {number|number[]} extent - Brick extent
 * @param {string} order - Row ordering
 * @param {number} x - X within the brick
 * @param {number} y - Y within the brick
 * @param {number} z - Z within the brick
 * @returns {number} - The sample
 */
export function brickVoxel(packed, extent, order, x, y, z) {
  const [ex] = toExtent(extent);
  return packed[brickRowIndex(order, y, z, extent) * ex + x];
}

/**
 * Unpacks a whole brick into an x-major volume buffer laid out as [z][y][x].
 * @param {ArrayBufferView} packed - Packed brick image
 * @param {number|number[]} extent - Brick extent
 * @param {string} order - Row ordering
 * @param {ArrayBufferView} [out] - Destination; allocated when absent
 * @returns {ArrayBufferView} - The unpacked volume, ex*ey*ez samples
 */
export function unpackBrick(packed, extent, order, out) {
  const [ex, ey, ez] = toExtent(extent);
  const volume = out ?? new packed.constructor(ex * ey * ez);
  for (let z = 0; z < ez; z++) {
    for (let y = 0; y < ey; y++) {
      const srcOff = brickRowIndex(order, y, z, extent) * ex;
      const destOff = (z * ey + y) * ex;
      volume.set(packed.subarray(srcOff, srcOff + ex), destOff);
    }
  }
  return volume;
}
