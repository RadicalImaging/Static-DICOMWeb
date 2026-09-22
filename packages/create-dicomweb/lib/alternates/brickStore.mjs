import { boxAverageStep, halveSize } from './boxFilter3d.mjs';
import {
  BRICK_ORDER_Z_MINOR,
  packBrickFromSlab,
  packedBrickDimensions,
  packedBrickLength,
} from './brickPacking.mjs';
import {
  HTJ2K_LOSSLESS_TRANSFER_SYNTAX_UID,
  JLS_LOSSLESS_TRANSFER_SYNTAX_UID,
} from './imageAttributes.mjs';

/** Brick edge length. 64 balances off-axis bytes against request count - see the analysis. */
export const DEFAULT_BRICK_SIZE = 64;

/** JPEG-LS lossless bricks. The MED predictor is what the row ordering is chosen to feed. */
export const BRICK_CODEC_JLS = 'jls';

/**
 * HTJ2K lossless bricks. A wavelet over the packed image instead of a scanline predictor, so it
 * sees further than one row but pays a transform across the packing's row wraps.
 */
export const BRICK_CODEC_HTJ2K = 'htj2k';

/**
 * The encodings a brick store can be written in, by name.
 *
 * The extension is the brick file's, and it is what a reader keys the decoder off, so it tracks
 * the transfer syntax rather than being cosmetic.
 */
export const BRICK_CODECS = Object.freeze({
  [BRICK_CODEC_JLS]: {
    name: BRICK_CODEC_JLS,
    transferSyntaxUID: JLS_LOSSLESS_TRANSFER_SYNTAX_UID,
    extension: '.jls',
  },
  [BRICK_CODEC_HTJ2K]: {
    name: BRICK_CODEC_HTJ2K,
    transferSyntaxUID: HTJ2K_LOSSLESS_TRANSFER_SYNTAX_UID,
    extension: '.jhc',
  },
});

/** Names accepted by `--brick-codec` */
export const BRICK_CODEC_NAMES = Object.freeze(Object.keys(BRICK_CODECS));

/** Coarsest level generated, as a downsample factor on the most reduced axis */
export const MAX_LEVEL_FACTOR = 32;

/** Manifest schema version. 2 added per-axis factors, per-level brickSize and unpadded bricks. */
export const BRICK_MANIFEST_VERSION = 2;

/** Name of the manifest, written last so its presence means the store is complete */
export const BRICK_MANIFEST_FILENAME = 'manifest.json';

/**
 * How far apart two axes' sample spacings may be before the finer one is halved on its own.
 *
 * A level is a resampling of the volume, and the resolution worth having on each axis is set by
 * physical spacing rather than by voxel count. sqrt(2) is the half-octave point: beyond it one
 * more halving of the fine axis brings the spacings closer together than leaving it alone does,
 * below it the axes are near enough that halving all three keeps the aspect ratio.
 */
const ISOTROPY_TOLERANCE = Math.SQRT2;

/**
 * Voxel count at or below which a level is stored as a single brick, as a multiple of
 * brickSize^3.
 *
 * The point of a coarse level is that one request produces something displayable in every
 * orientation, and a level of this size is that request. Two cubes' worth rather than one so a
 * level that is cubic in physical space but not in voxels - which is exactly what the spacing
 * driven ladder produces on anisotropic data - still lands in one object instead of being split
 * into two for the sake of a shape that means nothing at this resolution.
 */
const SINGLE_BRICK_CUBES = 2;

/**
 * Least total reduction, as the product of the per-axis factors, that a level other than d1 must
 * reach to be worth storing.
 *
 * An anisotropic ladder reaches isotropy through steps that halve only x and y, and those steps
 * divide the voxel count by 4 rather than 8. The first of them is therefore both the most
 * expensive level in the pyramid after d1 and the least useful, being only 2x coarser in-plane
 * than d1 and identical through-plane. Dropping it costs one refinement rung and roughly a
 * quarter of the base level in storage.
 *
 * 8 is the reduction a uniformly halved level already has, so on isotropic data this drops
 * nothing and the pyramid is unchanged. The test is on the factors rather than on the voxel count
 * because rounding odd axes up makes each level slightly larger than the ratio its factors imply
 * - a 301 slice volume's d2 is 1.003/8 of d1, which a voxel count comparison would drop.
 */
const MIN_STORED_REDUCTION = 8;

/**
 * One level of the pyramid.
 * @typedef {Object} BrickLevel
 * @property {string} name - `d1`, `d2`, or `d8_8_2` when the axes reduce by different factors
 * @property {number[]} factors - [fx, fy, fz] downsample factors relative to d1
 * @property {number[]} size - [x, y, z] true extent
 * @property {number[]} brickSize - [bx, by, bz] brick pitch at this level
 * @property {number[]} bricks - [kx, ky, kz] brick counts
 * @property {boolean} store - False when the level exists only to feed coarser ones
 * @property {boolean[]} halve - Axes halved by the step that produced this level
 */

/**
 * Level name. A single factor while the axes agree, so isotropic pyramids keep reading `d1`,
 * `d2`, `d4`; all three once they diverge, because `d8` would then not describe the level.
 * @param {number[]} factors - [fx, fy, fz]
 * @returns {string}
 */
export function levelName(factors) {
  const [fx, fy, fz] = factors;
  return fx === fy && fy === fz ? `d${fx}` : `d${fx}_${fy}_${fz}`;
}

/**
 * Which axes the next reduction should halve.
 *
 * An axis is halved when its samples are more than half an octave closer together than the
 * coarsest axis' are - that is, when it carries resolution the volume as a whole does not. When
 * no axis qualifies the spacings are already comparable, so all three halve and the aspect ratio
 * is preserved from there down.
 *
 * On isotropic data no axis is ever more than sqrt(2) finer than another, so this always returns
 * all three and the ladder is the familiar uniform one.
 *
 * @param {number[]} spacing - [sx, sy, sz] sample spacing in mm at the current level
 * @returns {boolean[]} - [hx, hy, hz]
 */
export function halvingAxes(spacing) {
  const coarsest = Math.max(...spacing);
  const threshold = coarsest / ISOTROPY_TOLERANCE;
  const halve = spacing.map(value => value < threshold);
  return halve.some(Boolean) ? halve : [true, true, true];
}

/**
 * Brick pitch for a level: the default cube, except that a level small enough to be worth one
 * request is given a brick the shape of the level so that it is exactly one object.
 *
 * Clamping to the level's own extent matters for the axes that have already collapsed - a
 * 32x32x2000 level should not carry 64-wide bricks that are half padding.
 *
 * @param {number[]} dims - [x, y, z] of the level
 * @param {number} brickSize - Default brick edge length
 * @param {number} singleBrickVoxels - Voxel count at or below which the level is one brick
 * @returns {number[]} - [bx, by, bz]
 */
export function levelBrickSize(dims, brickSize, singleBrickVoxels) {
  if (dims[0] * dims[1] * dims[2] <= singleBrickVoxels) {
    return [...dims];
  }
  return dims.map(size => Math.min(brickSize, size));
}

/** Number of bricks needed to cover `dims` at `brickSize`. */
function brickGridFor(dims, brickSize) {
  return [
    Math.ceil(dims[0] / brickSize[0]),
    Math.ceil(dims[1] / brickSize[1]),
    Math.ceil(dims[2] / brickSize[2]),
  ];
}

/**
 * True extent of one brick, clipped at the level's edge.
 * @param {BrickLevel} level - The level
 * @param {number} kx - Brick index along x
 * @param {number} ky - Brick index along y
 * @param {number} depth - Planes present in the slab, which is the z extent
 * @returns {number[]} - [ex, ey, ez]
 */
export function brickExtent(level, kx, ky, depth) {
  const [bx, by] = level.brickSize;
  return [Math.min(bx, level.size[0] - kx * bx), Math.min(by, level.size[1] - ky * by), depth];
}

/**
 * Plans the pyramid for a volume.
 *
 * A level is generated while its own largest spatial dimension still reaches the brick size:
 * once the whole level fits inside one brick along every axis, a coarser level would say nothing
 * the level above did not.
 *
 * Which axes each step reduces comes from the sample spacing rather than from a single factor.
 * With isotropic spacing - or with none supplied - every step halves all three axes and the plan
 * is the uniform `d1, d2, d4, ...` pyramid. With anisotropic spacing the fine axes are brought
 * in first, so the coarse levels are physically rather than numerically cubic.
 *
 * @param {number[]} size - [x, y, z] of the full resolution volume
 * @param {Object|number} [options] - Options, or the brick size for the legacy positional form
 * @param {number[]} [options.spacing] - [sx, sy, sz] sample spacing in mm at full resolution
 * @param {number} [options.brickSize=64] - Default brick edge length
 * @param {number} [options.maxFactor=32] - Coarsest downsample factor to generate
 * @param {number} [options.singleBrickVoxels] - Voxel count at or below which a level is one brick
 * @param {number} [options.minStoredReduction=8] - Least factor product a stored level must reach
 * @param {number} [legacyMaxFactor] - maxFactor, for the legacy positional form
 * @returns {BrickLevel[]} - Levels from d1 outwards, possibly empty
 */
export function planLevels(size, options = {}, legacyMaxFactor) {
  const opts =
    typeof options === 'number' ? { brickSize: options, maxFactor: legacyMaxFactor } : options;
  const {
    spacing,
    brickSize = DEFAULT_BRICK_SIZE,
    maxFactor = MAX_LEVEL_FACTOR,
    singleBrickVoxels = SINGLE_BRICK_CUBES * brickSize ** 3,
    minStoredReduction = MIN_STORED_REDUCTION,
  } = opts;

  const levels = [];
  let dims = [...size];
  // Absent spacing, every axis is treated as equally sampled, which is the uniform ladder.
  let sampleSpacing = spacing ? [...spacing] : [1, 1, 1];
  let factors = [1, 1, 1];
  let halve = [false, false, false];

  while (Math.max(...dims) >= brickSize && Math.max(...factors) <= maxFactor) {
    const pitch = levelBrickSize(dims, brickSize, singleBrickVoxels);
    const reduction = factors[0] * factors[1] * factors[2];
    levels.push({
      name: levelName(factors),
      factors: [...factors],
      size: [...dims],
      brickSize: pitch,
      bricks: brickGridFor(dims, pitch),
      // d1 is the point of the store and is always kept; beyond it, a level too close in size to
      // d1 is not paying for itself.
      store: levels.length === 0 || reduction >= minStoredReduction,
      halve: [...halve],
    });

    halve = halvingAxes(sampleSpacing);
    dims = dims.map((value, axis) => (halve[axis] ? halveSize(value) : value));
    sampleSpacing = sampleSpacing.map((value, axis) => (halve[axis] ? value * 2 : value));
    factors = factors.map((value, axis) => (halve[axis] ? value * 2 : value));
  }

  return levels;
}

/**
 * Accepts x-y planes of one pyramid level, emits its bricks, and feeds the level below.
 *
 * Planes arrive one at a time and are held in a slab of the level's brick depth; when the slab
 * fills, every brick at that z index is packed, encoded and written, and the slab is reused.
 * That is what keeps a 2048 slice series from having to be resident: the peak is one slab per
 * level, and the slabs shrink by 4x or 8x per level depending on which axes that step reduces,
 * so the whole chain costs a little over one full-resolution slab.
 *
 * Planes are also reduced and handed to the next level as they go, so the pyramid is built in a
 * single pass over the source frames. How many planes one reduction consumes depends on whether
 * the next level halves z: two when it does, one when it only reduces in-plane.
 */
class LevelSink {
  /**
   * @param {Object} params - Sink parameters
   * @param {BrickLevel} params.level - The level this sink writes
   * @param {boolean[]} params.nextHalve - Axes the step into the next level halves
   * @param {string} params.order - Brick row ordering
   * @param {Object} params.model - PixelValueModel for the samples
   * @param {Function} params.ArrayType - Typed array constructor for the samples
   * @param {(brick: Object) => Promise<void>} params.writeBrick
   * @param {LevelSink|null} params.next - Sink for the next coarser level
   */
  constructor({ level, nextHalve, order, model, ArrayType, writeBrick, next }) {
    this.level = level;
    this.order = order;
    this.model = model;
    this.ArrayType = ArrayType;
    this.writeBrick = writeBrick;
    this.next = next ?? null;

    const [sizeX, sizeY] = level.size;
    const brickDepth = level.brickSize[2];
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.brickDepth = brickDepth;
    this.planeLength = sizeX * sizeY;
    this.slab = new ArrayType(this.planeLength * brickDepth);
    this.brick = level.store ? new ArrayType(packedBrickLength(level.brickSize)) : null;
    this.slabDepth = 0;
    this.kz = 0;
    this.bricksWritten = 0;
    /** Views into the slab awaiting their partner in a z-halving reduction */
    this.pairPlanes = [];
    /** Copy of an unpaired plane displaced by a slab flush */
    this.carry = null;

    this.halveX = nextHalve?.[0] ?? true;
    this.halveY = nextHalve?.[1] ?? true;
    this.halveZ = nextHalve?.[2] ?? true;
    /** Planes one reduction consumes: a z-halving step averages a pair, an in-plane step does not */
    this.planesPerReduction = this.halveZ ? 2 : 1;
    this.reduced = next
      ? new ArrayType(
          (this.halveX ? halveSize(sizeX) : sizeX) * (this.halveY ? halveSize(sizeY) : sizeY)
        )
      : null;
  }

  /**
   * Adds one full plane of this level.
   * @param {ArrayBufferView} plane - sizeX * sizeY samples
   * @returns {Promise<void>}
   */
  async addPlane(plane) {
    const offset = this.slabDepth * this.planeLength;
    this.slab.set(plane, offset);
    this.slabDepth += 1;
    this.pairPlanes.push(this.slab.subarray(offset, offset + this.planeLength));

    if (this.pairPlanes.length === this.planesPerReduction) {
      await this._reducePending();
    }
    if (this.slabDepth === this.brickDepth) {
      await this._flushSlab();
    }
  }

  /**
   * Emits whatever is left: a partially filled slab and an unpaired plane.
   * @returns {Promise<void>}
   */
  async finish() {
    if (this.pairPlanes.length > 0) {
      await this._reducePending();
    }
    if (this.slabDepth > 0) {
      await this._flushSlab();
    }
    if (this.next) {
      await this.next.finish();
    }
  }

  /**
   * Reduces the buffered plane or pair into one plane of the next level.
   * @returns {Promise<void>}
   * @private
   */
  async _reducePending() {
    const planes = this.pairPlanes;
    this.pairPlanes = [];
    if (!this.next) {
      return;
    }
    boxAverageStep(
      {
        planes,
        columns: this.sizeX,
        rows: this.sizeY,
        model: this.model,
        halveX: this.halveX,
        halveY: this.halveY,
      },
      {
        pixelData: this.reduced,
        columns: this.halveX ? halveSize(this.sizeX) : this.sizeX,
        rows: this.halveY ? halveSize(this.sizeY) : this.sizeY,
      }
    );
    await this.next.addPlane(this.reduced);
  }

  /**
   * Packs, encodes and writes every brick of the current z index.
   * @returns {Promise<void>}
   * @private
   */
  async _flushSlab() {
    const [nkx, nky] = this.level.bricks;
    const depth = this.slabDepth;

    for (let ky = 0; ky < nky && this.level.store; ky++) {
      for (let kx = 0; kx < nkx; kx++) {
        const extent = brickExtent(this.level, kx, ky, depth);
        const packed = packBrickFromSlab({
          slab: this.slab,
          slabColumns: this.sizeX,
          slabRows: this.sizeY,
          x0: kx * this.level.brickSize[0],
          y0: ky * this.level.brickSize[1],
          extent,
          order: this.order,
          out: this.brick,
        });
        await this.writeBrick({
          level: this.level,
          kz: this.kz,
          ky,
          kx,
          extent,
          packed,
        });
        this.bricksWritten += 1;
      }
    }

    if (this.pairPlanes.length === 1) {
      // The slab is about to be rewritten from offset 0, so an unpaired plane cannot stay a view
      // into it. It is paired by the very next plane, so one buffer is enough.
      this.carry ??= new this.ArrayType(this.planeLength);
      this.carry.set(this.pairPlanes[0]);
      this.pairPlanes[0] = this.carry;
    }

    this.slabDepth = 0;
    this.kz += 1;
  }
}

/**
 * Builds the sink chain for a plan, coarsest first so each sink can hold the one below it.
 * @param {Object} params - Same as LevelSink, minus level/next/nextHalve
 * @param {BrickLevel[]} params.levels - The plan
 * @returns {{ head: LevelSink, sinks: LevelSink[] }}
 */
function buildSinkChain({ levels, order, model, ArrayType, writeBrick }) {
  let next = null;
  const sinks = [];
  for (let i = levels.length - 1; i >= 0; i--) {
    next = new LevelSink({
      level: levels[i],
      // How this level reduces into the next is recorded on the next level, as the step that
      // produced it.
      nextHalve: levels[i + 1]?.halve,
      order,
      model,
      ArrayType,
      writeBrick,
      next,
    });
    sinks.unshift(next);
  }
  return { head: sinks[0], sinks };
}

/**
 * Generates the brick store for one series.
 *
 * One pyramid is built per non-spatial index combination: time, channel and b-value are indexed
 * rather than subsampled, because every phase is wanted at reduced spatial resolution rather
 * than half the phases.
 *
 * @param {Object} params - Generation parameters
 * @param {Object} params.geometry - SeriesGeometry from buildSeriesGeometry
 * @param {number} params.brickSize - Default brick edge length
 * @param {number[]} [params.spacing] - [sx, sy, sz] sample spacing in mm at full resolution
 * @param {string} params.order - Brick row ordering
 * @param {Object} params.model - PixelValueModel for the samples
 * @param {Function} params.ArrayType - Typed array constructor for the samples
 * @param {(frame: Object) => Promise<ArrayBufferView>} params.readPlane - Reads one frame as a plane
 * @param {(packed: ArrayBufferView, packedDims: Object) => Promise<Uint8Array>} params.encodeBrick
 * @param {(descriptor: Object, data: Uint8Array) => Promise<void>} params.storeBrick
 * @param {(message: string) => void} [params.onProgress] - Called as each level's z index completes
 * @returns {Promise<{levels: BrickLevel[], plan: BrickLevel[], bricksWritten: number}>}
 */
export async function generateBrickStore({
  geometry,
  brickSize = DEFAULT_BRICK_SIZE,
  spacing,
  order = BRICK_ORDER_Z_MINOR,
  model,
  ArrayType,
  readPlane,
  encodeBrick,
  storeBrick,
  onProgress,
}) {
  const { attributes, sizeZ, volumes } = geometry;
  const plan = planLevels([attributes.columns, attributes.rows, sizeZ], { brickSize, spacing });
  if (plan.length === 0) {
    throw new Error(
      `volume ${attributes.columns}x${attributes.rows}x${sizeZ} is smaller than one ${brickSize}³ brick on every axis`
    );
  }

  let bricksWritten = 0;

  for (const volume of volumes) {
    const writeBrick = async ({ level, kz, ky, kx, extent, packed }) => {
      const data = await encodeBrick(packed, packedBrickDimensions(extent));
      await storeBrick({ level, indices: volume.indices, kz, ky, kx, extent }, data);
      bricksWritten += 1;
    };

    const { head, sinks } = buildSinkChain({
      levels: plan,
      order,
      model,
      ArrayType,
      writeBrick,
    });

    for (let z = 0; z < volume.frames.length; z++) {
      const plane = await readPlane(volume.frames[z]);
      await head.addPlane(plane);
      if (onProgress && (z + 1) % brickSize === 0) {
        onProgress(`d1 z ${z + 1}/${volume.frames.length}`);
      }
    }
    await head.finish();

    // The manifest promises these counts, so make sure the sinks agree with the plan rather
    // than publishing a number nothing checked.
    for (let i = 0; i < plan.length; i++) {
      const [nkx, nky, nkz] = plan[i].bricks;
      const expected = plan[i].store ? nkx * nky * nkz : 0;
      if (sinks[i].bricksWritten !== expected) {
        throw new Error(
          `level ${plan[i].name} wrote ${sinks[i].bricksWritten} bricks, plan says ${expected}`
        );
      }
    }
  }

  // Levels computed only to feed coarser ones are not part of the store, so they are not part of
  // what is returned to be published.
  return { levels: plan.filter(level => level.store), plan, bricksWritten };
}

/**
 * Builds the manifest for a generated store.
 * @param {Object} params - Manifest parameters
 * @param {Object} params.geometry - SeriesGeometry
 * @param {BrickLevel[]} params.levels - Generated levels
 * @param {number} params.brickSize - Default brick edge length
 * @param {string} params.order - Brick row ordering
 * @param {string} params.transferSyntaxUID - Transfer syntax the bricks are encoded with
 * @param {number[]} [params.spacing] - [sx, sy, sz] full resolution spacing in mm
 * @returns {Object} - The manifest
 */
export function buildManifest({ geometry, levels, brickSize, order, transferSyntaxUID, spacing }) {
  return {
    version: BRICK_MANIFEST_VERSION,
    axes: geometry.axes,
    dimensionIndexPointers: geometry.dimensionIndexPointers ?? [],
    // The default pitch. Each level also carries its own, because a coarse level is one object
    // whose brick is the shape of the level rather than a cube.
    brickSize: [brickSize, brickSize, brickSize],
    brickOrder: order,
    // Bricks are stored at their true extent, so a reader sizes each decode from the level's
    // size and brickSize rather than assuming every brick is full.
    brickPadding: false,
    ...(spacing ? { spacing } : {}),
    levels: levels.map(({ name, factors, size, brickSize: levelBricks, bricks }) => ({
      name,
      factors,
      size,
      brickSize: levelBricks,
      bricks,
    })),
    transferSyntaxUID,
  };
}

/**
 * Relative directory of one brick within a series' `brick/` store.
 * `{d}/{t###}/{k###}`, with the non-spatial component omitted for a plain 3D series.
 * @param {Object} descriptor - { level, indices, kz }
 * @returns {string}
 */
export function brickDirectory({ level, indices, kz }) {
  const parts = [level.name];
  for (const index of indices ?? []) {
    parts.push(`t${String(index).padStart(3, '0')}`);
  }
  parts.push(`k${String(kz).padStart(3, '0')}`);
  return parts.join('/');
}

/**
 * Filename of one brick within its directory.
 * @param {Object} descriptor - { ky, kx }
 * @param {string} [extension='.jls'] - Extension for the brick's encoding
 * @returns {string}
 */
export function brickFilename({ ky, kx }, extension = BRICK_CODECS[BRICK_CODEC_JLS].extension) {
  return `y${ky}x${kx}${extension}`;
}
