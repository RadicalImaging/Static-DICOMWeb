import { createPixelValueModel } from '@radicalimaging/static-wado-util';
import {
  BRICK_CODECS,
  BRICK_CODEC_HTJ2K,
  BRICK_CODEC_JLS,
  generateBrickStore,
  planLevels,
} from '../lib/alternates/brickStore.mjs';
import {
  BRICK_ORDER_PLANE_MAJOR,
  BRICK_ORDER_Z_MINOR,
  packedBrickDimensions,
  unpackBrick,
} from '../lib/alternates/brickPacking.mjs';
import { boxAverageStep, halveSize } from '../lib/alternates/boxFilter3d.mjs';
import { loadFrameCodec } from '../lib/alternates/frameCodec.mjs';

const BRICK_SIZE = 8;
const SIZE_X = 12;
const SIZE_Y = 10;
const SIZE_Z = 20;

const ATTRIBUTES = {
  bitsAllocated: 16,
  samplesPerPixel: 1,
  signed: false,
  pixelRepresentation: 0,
};

/**
 * A synthetic volume with structure in all three axes, so a packing or filtering mistake
 * changes the values rather than shuffling identical ones.
 * @param {number} columns - Volume columns
 * @param {number} rows - Volume rows
 * @param {number} depth - Volume planes
 * @returns {Uint16Array[]} - One plane per z
 */
function makeVolume(columns = SIZE_X, rows = SIZE_Y, depth = SIZE_Z) {
  const planes = [];
  for (let z = 0; z < depth; z++) {
    const plane = new Uint16Array(columns * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        plane[y * columns + x] = (x * 37 + y * 101 + z * 7) % 4096;
      }
    }
    planes.push(plane);
  }
  return planes;
}

/**
 * Reduces a whole volume by one level with the same box filter the pyramid uses, but computed
 * independently of the streaming sink, so agreement is a real check.
 *
 * `halve` is what makes this an independent check of the anisotropic ladder rather than only of
 * the filter: an in-plane-only step must pass every plane through at reduced in-plane resolution,
 * not average pairs of them.
 *
 * @param {Object} volume - { planes, columns, rows }
 * @param {boolean[]} halve - [hx, hy, hz] of this step
 * @param {Object} model - PixelValueModel
 * @returns {{planes: Uint16Array[], columns: number, rows: number}}
 */
function reduceVolume({ planes, columns, rows }, halve, model) {
  const [halveX, halveY, halveZ] = halve;
  const destColumns = halveX ? halveSize(columns) : columns;
  const destRows = halveY ? halveSize(rows) : rows;
  const step = halveZ ? 2 : 1;
  const reduced = [];

  for (let z = 0; z < planes.length; z += step) {
    const dest = new Uint16Array(destColumns * destRows);
    boxAverageStep(
      { planes: planes.slice(z, z + step), columns, rows, model, halveX, halveY },
      { pixelData: dest, columns: destColumns, rows: destRows }
    );
    reduced.push(dest);
  }

  return { planes: reduced, columns: destColumns, rows: destRows };
}

/**
 * Runs the generator over a synthetic volume, collecting every brick it stores.
 * @param {Object} params - Run parameters
 * @returns {Promise<{result: Object, stored: Map<string, Object>, attributes: Object}>}
 */
async function generate({ codec, source, columns, rows, spacing, order, brickSize = BRICK_SIZE }) {
  const model = createPixelValueModel({ bitsAllocated: 16, pixelRepresentation: 0 });
  const attributes = { ...ATTRIBUTES, rows, columns };
  const geometry = {
    attributes,
    sizeZ: source.length,
    axes: [],
    volumes: [{ indices: [], frames: source.map((_, z) => ({ z })) }],
  };

  /** @type {Map<string, {data: Uint8Array, extent: number[]}>} */
  const stored = new Map();
  const result = await generateBrickStore({
    geometry,
    brickSize,
    spacing,
    order,
    model,
    ArrayType: Uint16Array,
    readPlane: async frame => source[frame.z],
    encodeBrick: (packed, dims) =>
      codec.encodeFrameFromPixelData(
        packed,
        { ...attributes, rows: dims.rows, columns: dims.columns },
        codec.JLS_LOSSLESS_TRANSFER_SYNTAX_UID
      ),
    storeBrick: async (descriptor, data) => {
      stored.set(`${descriptor.level.name}/${descriptor.kz}/${descriptor.ky}/${descriptor.kx}`, {
        data: Uint8Array.prototype.slice.call(data),
        extent: descriptor.extent,
      });
    },
  });

  return { result, stored, attributes, model };
}

/**
 * Checks every stored brick of every level against an independently reduced reference volume.
 * @param {Object} params - Verification parameters
 * @returns {Promise<void>}
 */
async function verifyLevels({
  codec,
  result,
  stored,
  attributes,
  model,
  source,
  columns,
  rows,
  order,
}) {
  let expected = { planes: source, columns, rows };

  for (const level of result.plan) {
    expect(level.size).toEqual([expected.columns, expected.rows, expected.planes.length]);

    if (level.store) {
      const [nkx, nky, nkz] = level.bricks;
      const [bx, by, bz] = level.brickSize;

      for (let kz = 0; kz < nkz; kz++) {
        for (let ky = 0; ky < nky; ky++) {
          for (let kx = 0; kx < nkx; kx++) {
            const entry = stored.get(`${level.name}/${kz}/${ky}/${kx}`);
            expect(entry).toBeDefined();

            const [ex, ey, ez] = entry.extent;
            // The extent is the brick's true occupied size, so an edge brick is a smaller image
            expect([ex, ey, ez]).toEqual([
              Math.min(bx, expected.columns - kx * bx),
              Math.min(by, expected.rows - ky * by),
              Math.min(bz, expected.planes.length - kz * bz),
            ]);

            const dims = packedBrickDimensions(entry.extent);
            const raw = await codec.decodeFrameToBytes(
              entry.data,
              { ...attributes, rows: dims.rows, columns: dims.columns },
              codec.JLS_LOSSLESS_TRANSFER_SYNTAX_UID
            );
            const packed = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
            const volume = unpackBrick(packed, entry.extent, order);

            for (let z = 0; z < ez; z++) {
              for (let y = 0; y < ey; y++) {
                for (let x = 0; x < ex; x++) {
                  const sx = kx * bx + x;
                  const sy = ky * by + y;
                  const sz = kz * bz + z;
                  expect(volume[(z * ey + y) * ex + x]).toBe(
                    expected.planes[sz][sy * expected.columns + sx]
                  );
                }
              }
            }
          }
        }
      }
    } else {
      expect(stored.has(`${level.name}/0/0/0`)).toBe(false);
    }

    const next = result.plan[result.plan.indexOf(level) + 1];
    if (next) {
      expected = reduceVolume(expected, next.halve, model);
    }
  }
}

describe('brick pyramid end to end', () => {
  let codec;

  beforeAll(async () => {
    codec = await loadFrameCodec();
  });

  for (const order of [BRICK_ORDER_Z_MINOR, BRICK_ORDER_PLANE_MAJOR]) {
    it(`round-trips every level losslessly through JPEG-LS with ${order}`, async () => {
      const source = makeVolume();
      const { result, stored, attributes, model } = await generate({
        codec,
        source,
        columns: SIZE_X,
        rows: SIZE_Y,
        order,
      });

      expect(result.plan.map(level => level.name)).toEqual(
        planLevels([SIZE_X, SIZE_Y, SIZE_Z], BRICK_SIZE).map(level => level.name)
      );
      expect(result.plan.length).toBeGreaterThan(1);

      await verifyLevels({
        codec,
        result,
        stored,
        attributes,
        model,
        source,
        columns: SIZE_X,
        rows: SIZE_Y,
        order,
      });
    }, 60000);

    it(`reduces the fine axes first on anisotropic spacing with ${order}`, async () => {
      // 1mm in-plane against 5mm slices, so the first two steps reduce in-plane only and every
      // plane passes straight through. That is the path a uniform pyramid never takes.
      const source = makeVolume(16, 16, 20);
      const { result, stored, attributes, model } = await generate({
        codec,
        source,
        columns: 16,
        rows: 16,
        spacing: [1, 1, 5],
        order,
      });

      expect(result.plan.map(level => level.name)).toEqual(['d1', 'd2_2_1', 'd4_4_1', 'd8_8_2']);
      expect(result.plan.map(level => level.size)).toEqual([
        [16, 16, 20],
        [8, 8, 20],
        [4, 4, 20],
        [2, 2, 10],
      ]);
      // The in-plane-only level is computed to feed the coarser ones but not written
      expect(result.levels.map(level => level.name)).toEqual(['d1', 'd4_4_1', 'd8_8_2']);
      // Both coarse levels are one object each, shaped like the level rather than as cubes
      expect(result.plan[2].brickSize).toEqual([4, 4, 20]);
      expect(result.plan[3].brickSize).toEqual([2, 2, 10]);

      await verifyLevels({
        codec,
        result,
        stored,
        attributes,
        model,
        source,
        columns: 16,
        rows: 16,
        order,
      });
    }, 60000);
  }

  it('writes one pyramid per non-spatial index rather than subsampling them', async () => {
    const source = makeVolume();
    const attributes = { ...ATTRIBUTES, rows: SIZE_Y, columns: SIZE_X };
    const geometry = {
      attributes,
      sizeZ: SIZE_Z,
      axes: [],
      volumes: [
        { indices: [0], frames: source.map((_, z) => ({ z })) },
        { indices: [1], frames: source.map((_, z) => ({ z })) },
      ],
    };

    const indicesSeen = new Set();
    const result = await generateBrickStore({
      geometry,
      brickSize: BRICK_SIZE,
      order: BRICK_ORDER_Z_MINOR,
      model: createPixelValueModel({ bitsAllocated: 16 }),
      ArrayType: Uint16Array,
      readPlane: async frame => source[frame.z],
      encodeBrick: async packed => new Uint8Array(packed.buffer.slice(0)),
      storeBrick: async descriptor => {
        indicesSeen.add(descriptor.indices.join(','));
      },
    });

    expect([...indicesSeen].sort()).toEqual(['0', '1']);
    const perVolume = result.levels.reduce(
      (sum, level) => sum + level.bricks[0] * level.bricks[1] * level.bricks[2],
      0
    );
    expect(result.bricksWritten).toBe(perVolume * 2);
  }, 60000);
});

/** First bytes of each encoding's codestream, so a freed buffer cannot pass for one */
const CODESTREAM_MAGIC = {
  [BRICK_CODEC_JLS]: [0xff, 0xd8, 0xff, 0xf7],
  [BRICK_CODEC_HTJ2K]: [0xff, 0x4f, 0xff, 0x51],
};

describe('brick codecs', () => {
  let codec;

  beforeAll(async () => {
    codec = await loadFrameCodec();
  });

  for (const encoding of Object.values(BRICK_CODECS)) {
    it(`encodes a packed brick to a ${encoding.name} codestream that outlives the encoder`, async () => {
      const { columns, rows } = packedBrickDimensions(BRICK_SIZE);
      const packed = new Uint16Array(columns * rows);
      for (let i = 0; i < packed.length; i++) {
        packed[i] = (i * 37) % 4096;
      }
      const imageInfo = { ...ATTRIBUTES, rows, columns };

      const encoded = await codec.encodeFrameFromPixelData(
        packed,
        imageInfo,
        encoding.transferSyntaxUID
      );

      // The codec buffers live in WASM memory the encoder frees on the way out, so a caller can
      // be handed reused memory that is the right length and the wrong bytes. The header is what
      // tells that apart from a real codestream.
      expect([...encoded.slice(0, 4)]).toEqual(CODESTREAM_MAGIC[encoding.name]);

      const raw = await codec.decodeFrameToBytes(encoded, imageInfo, encoding.transferSyntaxUID);
      const decoded = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
      // The leading samples are what a freed decode buffer loses first, since the allocator
      // writes its free-list header there, so they are worth naming rather than leaving to the
      // whole-array comparison below.
      expect([...decoded.slice(0, 4)]).toEqual([...packed.slice(0, 4)]);
      expect([...decoded]).toEqual([...packed]);
    }, 60000);
  }
});
