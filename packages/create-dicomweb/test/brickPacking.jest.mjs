import {
  BRICK_ORDER_PLANE_MAJOR,
  BRICK_ORDER_Z_MINOR,
  brickRowIndex,
  brickVoxel,
  packBrickFromSlab,
  packedBrickDimensions,
  unpackBrick,
} from '../lib/alternates/brickPacking.mjs';
import { halvingAxes, levelName, planLevels } from '../lib/alternates/brickStore.mjs';

/**
 * Builds a slab whose every sample encodes its own (x, y, z), so a mispacked voxel is
 * identifiable rather than merely unequal.
 * @param {number} columns - Slab columns
 * @param {number} rows - Slab rows
 * @param {number} depth - Slab planes
 * @returns {Uint16Array}
 */
function makeSlab(columns, rows, depth) {
  const slab = new Uint16Array(columns * rows * depth);
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        slab[(z * rows + y) * columns + x] = z * 10000 + y * 100 + x + 1;
      }
    }
  }
  return slab;
}

describe('brick packing', () => {
  const brickSize = 4;

  it('packs into an x-extent wide, y*z tall image', () => {
    expect(packedBrickDimensions(64)).toEqual({ columns: 64, rows: 4096 });
    expect(packedBrickDimensions(brickSize)).toEqual({ columns: 4, rows: 16 });
    // A coarse level small enough to be one object gets a brick the shape of the level
    expect(packedBrickDimensions([64, 64, 87])).toEqual({ columns: 64, rows: 5568 });
  });

  it('puts (x-1, y, z) left and (x, y, z-1) above for z-minor', () => {
    // Consecutive z land on consecutive rows, so the row above holds the previous slice
    expect(brickRowIndex(BRICK_ORDER_Z_MINOR, 2, 3, brickSize)).toBe(11);
    expect(brickRowIndex(BRICK_ORDER_Z_MINOR, 2, 2, brickSize)).toBe(10);
    // The row stride is the z extent, so a non-cubic brick still stacks z down the rows
    expect(brickRowIndex(BRICK_ORDER_Z_MINOR, 1, 5, [64, 64, 87])).toBe(92);
  });

  it('puts (x, y-1, z) above for plane-major', () => {
    expect(brickRowIndex(BRICK_ORDER_PLANE_MAJOR, 3, 2, brickSize)).toBe(11);
    expect(brickRowIndex(BRICK_ORDER_PLANE_MAJOR, 2, 2, brickSize)).toBe(10);
    // Here the stride is the y extent instead
    expect(brickRowIndex(BRICK_ORDER_PLANE_MAJOR, 3, 1, [64, 64, 87])).toBe(67);
  });

  for (const order of [BRICK_ORDER_Z_MINOR, BRICK_ORDER_PLANE_MAJOR]) {
    it(`round-trips a full brick with ${order}`, () => {
      const slab = makeSlab(brickSize, brickSize, brickSize);
      const out = new Uint16Array(brickSize ** 3);

      const packed = packBrickFromSlab({
        slab,
        slabColumns: brickSize,
        slabRows: brickSize,
        x0: 0,
        y0: 0,
        extent: [brickSize, brickSize, brickSize],
        order,
        out,
      });

      for (let z = 0; z < brickSize; z++) {
        for (let y = 0; y < brickSize; y++) {
          for (let x = 0; x < brickSize; x++) {
            expect(brickVoxel(packed, brickSize, order, x, y, z)).toBe(
              slab[(z * brickSize + y) * brickSize + x]
            );
          }
        }
      }

      const volume = unpackBrick(packed, brickSize, order);
      expect(Array.from(volume)).toEqual(Array.from(slab));
    });

    it(`packs an interior brick at an offset with ${order}`, () => {
      // A 8x8 level split into 4^3 bricks: take the brick at kx=1, ky=1
      const slab = makeSlab(8, 8, brickSize);
      const out = new Uint16Array(brickSize ** 3);

      const packed = packBrickFromSlab({
        slab,
        slabColumns: 8,
        slabRows: 8,
        x0: 4,
        y0: 4,
        extent: [brickSize, brickSize, brickSize],
        order,
        out,
      });

      expect(brickVoxel(packed, brickSize, order, 0, 0, 0)).toBe(slab[(0 * 8 + 4) * 8 + 4]);
      expect(brickVoxel(packed, brickSize, order, 3, 3, 3)).toBe(slab[(3 * 8 + 7) * 8 + 7]);
    });

    it(`stores an edge brick at its true extent rather than padding it with ${order}`, () => {
      // 3x3x2 of data at the corner of a level whose brick pitch is 4: the brick is a 3x3x2
      // image, not a 4^3 one with zeros in it, so nothing is encoded or decoded that is not data.
      const slab = makeSlab(3, 3, 2);
      const extent = [3, 3, 2];
      const out = new Uint16Array(brickSize ** 3).fill(0xbeef);

      const packed = packBrickFromSlab({
        slab,
        slabColumns: 3,
        slabRows: 3,
        x0: 0,
        y0: 0,
        extent,
        order,
        out,
      });

      expect(packed.length).toBe(3 * 3 * 2);
      expect(packedBrickDimensions(extent)).toEqual({ columns: 3, rows: 6 });

      for (let z = 0; z < 2; z++) {
        for (let y = 0; y < 3; y++) {
          for (let x = 0; x < 3; x++) {
            expect(brickVoxel(packed, extent, order, x, y, z)).toBe(slab[(z * 3 + y) * 3 + x]);
          }
        }
      }

      expect(Array.from(unpackBrick(packed, extent, order))).toEqual(Array.from(slab));
    });
  }

  it('the two orderings are genuinely different packings', () => {
    const slab = makeSlab(brickSize, brickSize, brickSize);
    const zMinor = new Uint16Array(brickSize ** 3);
    const planeMajor = new Uint16Array(brickSize ** 3);
    const args = {
      slab,
      slabColumns: brickSize,
      slabRows: brickSize,
      x0: 0,
      y0: 0,
      extent: [brickSize, brickSize, brickSize],
    };

    packBrickFromSlab({ ...args, order: BRICK_ORDER_Z_MINOR, out: zMinor });
    packBrickFromSlab({ ...args, order: BRICK_ORDER_PLANE_MAJOR, out: planeMajor });

    expect(Array.from(zMinor)).not.toEqual(Array.from(planeMajor));
    // Same multiset of samples, only the row assignment differs
    expect(Array.from(zMinor).sort()).toEqual(Array.from(planeMajor).sort());
  });
});

describe('halvingAxes', () => {
  it('halves all three axes when the spacing is isotropic', () => {
    expect(halvingAxes([1, 1, 1])).toEqual([true, true, true]);
    expect(halvingAxes([0.7, 0.7, 0.8])).toEqual([true, true, true]);
  });

  it('halves only the fine axes while an axis is more than half an octave coarser', () => {
    // 0.98mm in-plane against 5mm slices: reducing z as hard as x and y would leave a coarse
    // level with too few slices to reform, so z is left alone until the others catch up
    expect(halvingAxes([0.9765625, 0.9765625, 5])).toEqual([true, true, false]);
    expect(halvingAxes([3.90625, 3.90625, 5])).toEqual([true, true, true]);
  });

  it('halves a fine z on its own when the slices are thinner than the pixels', () => {
    expect(halvingAxes([2, 2, 0.5])).toEqual([false, false, true]);
  });
});

describe('levelName', () => {
  it('keeps the single factor form while the axes agree', () => {
    expect(levelName([1, 1, 1])).toBe('d1');
    expect(levelName([8, 8, 8])).toBe('d8');
  });

  it('names all three factors once they diverge, since d8 would not describe the level', () => {
    expect(levelName([8, 8, 2])).toBe('d8_8_2');
    expect(levelName([4, 4, 1])).toBe('d4_4_1');
  });
});

describe('planLevels', () => {
  it('halves every spatial axis and stops below the brick size', () => {
    const levels = planLevels([512, 512, 2048], 64);

    expect(levels.map(level => level.name)).toEqual(['d1', 'd2', 'd4', 'd8', 'd16', 'd32']);
    expect(levels[0].size).toEqual([512, 512, 2048]);
    expect(levels[0].bricks).toEqual([8, 8, 32]);
    expect(levels[5].size).toEqual([16, 16, 64]);
    expect(levels[5].bricks).toEqual([1, 1, 1]);
  });

  it('stores every level of a uniform pyramid, since none is oversized relative to d1', () => {
    // A uniformly halved level is exactly 1/8 of the one above, which is the storage limit, so
    // consulting the spacing must not silently drop levels on isotropic data
    const levels = planLevels([512, 512, 2048], { brickSize: 64, spacing: [0.7, 0.7, 0.7] });

    expect(levels.map(level => level.name)).toEqual(['d1', 'd2', 'd4', 'd8', 'd16', 'd32']);
    expect(levels.every(level => level.store)).toBe(true);
  });

  it('rounds odd axes up so the edge slice is not dropped', () => {
    const levels = planLevels([128, 128, 301], 64);

    expect(levels.map(level => level.name)).toEqual(['d1', 'd2', 'd4']);
    expect(levels[1].size).toEqual([64, 64, 151]);
    expect(levels[2].size).toEqual([32, 32, 76]);
    // 32x32x76 is 78k voxels, inside the single-brick budget, so it is one object rather than the
    // two a 64-cube pitch would have split it into
    expect(levels[2].brickSize).toEqual([32, 32, 76]);
    expect(levels[2].bricks).toEqual([1, 1, 1]);
  });

  it('plans nothing for a volume smaller than one brick on every axis', () => {
    expect(planLevels([32, 32, 20], 64)).toEqual([]);
  });

  describe('anisotropic spacing', () => {
    // The Juno CT: 512x512x174 at 0.9765625mm in-plane, 5mm slices, so 5.1:1 anisotropic
    const juno = () =>
      planLevels([512, 512, 174], { brickSize: 64, spacing: [0.9765625, 0.9765625, 5] });

    it('brings the fine axes in first, so coarse levels are physically cubic', () => {
      expect(juno().map(level => level.name)).toEqual(['d1', 'd2_2_1', 'd4_4_1', 'd8_8_2']);
      expect(juno().map(level => level.size)).toEqual([
        [512, 512, 174],
        [256, 256, 174],
        [128, 128, 174],
        [64, 64, 87],
      ]);
    });

    it('makes the coarsest level a single object shaped like the level', () => {
      const coarsest = juno().at(-1);

      expect(coarsest.size).toEqual([64, 64, 87]);
      expect(coarsest.brickSize).toEqual([64, 64, 87]);
      expect(coarsest.bricks).toEqual([1, 1, 1]);
    });

    it('drops the first in-plane-only level, which costs a quarter of d1 for one rung', () => {
      const levels = juno();
      const stored = levels.filter(level => level.store).map(level => level.name);

      expect(stored).toEqual(['d1', 'd4_4_1', 'd8_8_2']);
      // d2_2_1 keeps all 174 slices at 256x256, so it is 1/4 of d1 rather than 1/8
      expect(levels[1].store).toBe(false);
    });

    it('reduces through-plane only once the in-plane spacing has caught up', () => {
      const levels = juno();

      // d2_2_1 and d4_4_1 keep every slice; the step into d8_8_2 halves all three
      expect(levels[1].halve).toEqual([true, true, false]);
      expect(levels[2].halve).toEqual([true, true, false]);
      expect(levels[3].halve).toEqual([true, true, true]);
    });
  });
});
