import { Tags } from '@radicalimaging/static-wado-util';
import { canEncodeGrayscaleFrames, getImageAttributes } from './imageAttributes.mjs';

const { getValue, getList } = Tags;

/** Minimum spatial slices worth a brick store; below this the whole series is a cheap fetch */
export const MIN_BRICK_SLICES = 16;

/**
 * Fraction of the median slice spacing that a single gap may deviate by before the stack is
 * treated as irregular. A pure resample assumes a rectilinear grid, so a stack with a missing
 * slice or a varying pitch would be resampled onto a grid it does not lie on.
 */
const SPACING_TOLERANCE_FRACTION = 0.01;

/** Absolute floor for the spacing tolerance, in mm, for very thin slices */
const SPACING_TOLERANCE_MM = 0.01;

/**
 * Fraction of the slice spacing that the in-plane component of a slice-to-slice offset may
 * reach before the stack is treated as sheared. A gantry tilted acquisition steps diagonally
 * rather than along the slice normal, so stacking its frames into a rectilinear volume shears
 * the anatomy.
 */
const SHEAR_TOLERANCE_FRACTION = 0.01;

/** Direction cosines must agree to this many mm per unit before frames count as coplanar */
const ORIENTATION_TOLERANCE = 1e-4;

/**
 * One frame of a series, with where it sits in space.
 * @typedef {Object} FrameRef
 * @property {Object} instanceMetadata - The instance's metadata
 * @property {string} instanceUid - SOP Instance UID
 * @property {number} frameNumber - 1-based frame number within the instance
 * @property {number[]|undefined} position - ImagePositionPatient
 * @property {number} distance - Position projected onto the slice normal
 */

/**
 * The spatial layout of a series, plus whether a brick store can be built from it.
 * @typedef {Object} SeriesGeometry
 * @property {boolean} eligible - True when a brick store can be generated
 * @property {string} [reason] - Why not, when ineligible
 * @property {Object} attributes - Image attributes of the first instance
 * @property {FrameRef[]} frames - Every frame in the series, in metadata order
 * @property {number} totalFrames - frames.length
 * @property {number} sizeZ - Number of distinct spatial positions
 * @property {number} spacing - Median spacing between spatial positions, mm
 * @property {Array<{indices: number[], frames: FrameRef[]}>} volumes - One entry per
 *   non-spatial index combination, each holding sizeZ frames ordered by increasing z
 * @property {Array<{name: string, type: string, size: number, subsample: boolean}>} axes
 */

/**
 * Enumerates the frames of a series and works out its spatial layout.
 *
 * Positions come from ImagePositionPatient, per frame when the instance is an enhanced
 * multiframe (PerFrameFunctionalGroupsSequence) and per instance otherwise. Frames sharing a
 * spatial position are treated as samples of a non-spatial axis - time, channel, b-value -
 * which is how a 4D series is recognised without having to interpret its
 * DimensionIndexSequence.
 *
 * @param {Object[]} instanceMetadataArray - Series metadata, one entry per instance
 * @returns {SeriesGeometry}
 */
export function buildSeriesGeometry(instanceMetadataArray) {
  if (!Array.isArray(instanceMetadataArray) || instanceMetadataArray.length === 0) {
    return ineligible('series has no instance metadata');
  }

  const attributes = getImageAttributes(instanceMetadataArray[0]);
  const frames = enumerateFrames(instanceMetadataArray);
  const base = { attributes, frames, totalFrames: frames.length };

  const encodable = canEncodeGrayscaleFrames(attributes);
  if (!encodable.ok) {
    return ineligible(encodable.reason, base);
  }
  if (frames.length < 2) {
    return ineligible('single frame series', base);
  }

  const orientation = firstOrientation(frames);
  if (!orientation) {
    return ineligible('no ImageOrientationPatient, cannot establish a spatial z axis', base);
  }
  const normal = crossProduct(orientation.slice(0, 3), orientation.slice(3, 6));

  for (const frame of frames) {
    if (!frame.orientation) {
      return ineligible('a frame has no ImageOrientationPatient', base);
    }
    if (!vectorsClose(frame.orientation, orientation, ORIENTATION_TOLERANCE)) {
      return ineligible('frames are not coplanar (ImageOrientationPatient varies)', base);
    }
    if (!frame.position) {
      return ineligible('a frame has no ImagePositionPatient, cannot order it along z', base);
    }
    frame.distance = dotProduct(frame.position, normal);
  }

  const groups = groupByDistance(frames);
  if (groups.length < 2) {
    // Every frame sits at the same place, so the third index is time rather than space. There
    // is no off-axis plane to serve, and the base frames already cover every access this
    // series supports.
    return ineligible(
      'third index is temporal, not spatial (all frames share one ImagePositionPatient)',
      base
    );
  }
  if (groups.length < MIN_BRICK_SLICES) {
    return ineligible(`only ${groups.length} spatial slices, fewer than ${MIN_BRICK_SLICES}`, base);
  }

  const nonSpatialSize = groups[0].frames.length;
  if (groups.some(group => group.frames.length !== nonSpatialSize)) {
    return ineligible('ragged sampling: spatial positions carry differing numbers of frames', base);
  }

  const spacings = [];
  for (let i = 1; i < groups.length; i++) {
    spacings.push(groups[i].distance - groups[i - 1].distance);
  }
  const spacing = median(spacings);
  if (!(spacing > 0)) {
    return ineligible('slice spacing is zero or undefined', base);
  }
  const spacingTolerance = Math.max(SPACING_TOLERANCE_MM, spacing * SPACING_TOLERANCE_FRACTION);
  const worstSpacing = spacings.reduce(
    (worst, value) => Math.max(worst, Math.abs(value - spacing)),
    0
  );
  if (worstSpacing > spacingTolerance) {
    return ineligible(
      `irregular slice spacing (median ${spacing.toFixed(4)}mm, worst deviation ${worstSpacing.toFixed(4)}mm)`,
      base
    );
  }

  const shearTolerance = Math.max(SPACING_TOLERANCE_MM, spacing * SHEAR_TOLERANCE_FRACTION);
  for (let i = 1; i < groups.length; i++) {
    const delta = subtract(groups[i].frames[0].position, groups[i - 1].frames[0].position);
    const alongNormal = dotProduct(delta, normal);
    const inPlane = magnitude(subtract(delta, scale(normal, alongNormal)));
    if (inPlane > shearTolerance) {
      return ineligible(
        `stack is sheared (gantry tilt): slice offset has a ${inPlane.toFixed(4)}mm in-plane component`,
        base
      );
    }
  }

  const volumes = [];
  for (let t = 0; t < nonSpatialSize; t++) {
    volumes.push({ indices: nonSpatialSize > 1 ? [t] : [], frames: groups.map(g => g.frames[t]) });
  }

  const axes = [
    { name: 'x', type: 'space', size: attributes.columns, subsample: true },
    { name: 'y', type: 'space', size: attributes.rows, subsample: true },
    { name: 'z', type: 'space', size: groups.length, subsample: true },
  ];
  if (nonSpatialSize > 1) {
    // Indexed, never subsampled: every time point is wanted at reduced spatial resolution,
    // not half the time points.
    axes.push({ name: 't', type: 'time', size: nonSpatialSize, subsample: false });
  }

  return {
    eligible: true,
    attributes,
    frames,
    totalFrames: frames.length,
    sizeZ: groups.length,
    spacing,
    voxelSpacing: voxelSpacingOf(attributes, spacing),
    nonSpatialSize,
    volumes,
    axes,
    dimensionIndexPointers: readDimensionIndexPointers(instanceMetadataArray[0]),
  };
}

/**
 * Sample spacing along the volume's own [x, y, z], in mm.
 *
 * DICOM PixelSpacing is [row spacing, column spacing], so it is y before x; the store's axes are
 * x, y, z, and getting that transposition wrong would put the anisotropy on the wrong axis and
 * reduce the wrong one. Absent PixelSpacing the in-plane spacing is taken to equal the slice
 * spacing, which makes the pyramid uniform - the same plan as before spacing was consulted, and
 * the right fallback because guessing anisotropy from nothing would be worse than not reducing.
 *
 * @param {Object} attributes - Image attributes, for pixelSpacing
 * @param {number} spacing - Median slice spacing in mm
 * @returns {number[]} - [sx, sy, sz]
 */
function voxelSpacingOf(attributes, spacing) {
  const pixelSpacing = attributes?.pixelSpacing;
  if (!pixelSpacing) {
    return [spacing, spacing, spacing];
  }
  return [pixelSpacing[1], pixelSpacing[0], spacing];
}

/**
 * Enumerates every frame of every instance, resolving per-frame position and orientation.
 * @param {Object[]} instanceMetadataArray - Series metadata
 * @returns {FrameRef[]}
 */
function enumerateFrames(instanceMetadataArray) {
  const frames = [];
  for (const instanceMetadata of instanceMetadataArray) {
    const instanceUid = getValue(instanceMetadata, Tags.SOPInstanceUID);
    const attributes = getImageAttributes(instanceMetadata);
    const perFrame = getList(instanceMetadata, Tags.PerFrameFunctionalGroupsSequence);
    const shared = getList(instanceMetadata, Tags.SharedFunctionalGroupsSequence)?.[0];

    for (let frameIndex = 0; frameIndex < attributes.numberOfFrames; frameIndex++) {
      const functionalGroup = perFrame?.[frameIndex];
      frames.push({
        instanceMetadata,
        instanceUid,
        frameNumber: frameIndex + 1,
        position: framePosition(instanceMetadata, functionalGroup, shared),
        orientation: frameOrientation(instanceMetadata, functionalGroup, shared),
        distance: 0,
      });
    }
  }
  return frames;
}

/**
 * ImagePositionPatient for a frame, preferring its own functional group.
 * @param {Object} instanceMetadata - Instance metadata
 * @param {Object} [functionalGroup] - This frame's PerFrameFunctionalGroups item
 * @param {Object} [shared] - The SharedFunctionalGroups item
 * @returns {number[]|undefined}
 */
function framePosition(instanceMetadata, functionalGroup, shared) {
  return (
    numberList(
      valueOf(
        getSequenceItem(functionalGroup, Tags.PlanePositionSequence),
        Tags.ImagePositionPatient
      )
    ) ??
    numberList(
      valueOf(getSequenceItem(shared, Tags.PlanePositionSequence), Tags.ImagePositionPatient)
    ) ??
    numberList(valueOf(instanceMetadata, Tags.ImagePositionPatient))
  );
}

/**
 * ImageOrientationPatient for a frame, preferring its own functional group.
 * @param {Object} instanceMetadata - Instance metadata
 * @param {Object} [functionalGroup] - This frame's PerFrameFunctionalGroups item
 * @param {Object} [shared] - The SharedFunctionalGroups item
 * @returns {number[]|undefined}
 */
function frameOrientation(instanceMetadata, functionalGroup, shared) {
  return (
    numberList(
      valueOf(
        getSequenceItem(functionalGroup, Tags.PlaneOrientationSequence),
        Tags.ImageOrientationPatient
      )
    ) ??
    numberList(
      valueOf(getSequenceItem(shared, Tags.PlaneOrientationSequence), Tags.ImageOrientationPatient)
    ) ??
    numberList(valueOf(instanceMetadata, Tags.ImageOrientationPatient))
  );
}

/**
 * First frame orientation available, used as the reference plane.
 * @param {FrameRef[]} frames - Enumerated frames
 * @returns {number[]|undefined}
 */
function firstOrientation(frames) {
  for (const frame of frames) {
    if (frame.orientation?.length === 6) {
      return frame.orientation;
    }
  }
  return undefined;
}

/**
 * The DimensionIndexPointer values of the series' DimensionIndexSequence, in `(gggg,eeee)`
 * form, so a reader can map store axes onto the series' own addressing.
 * @param {Object} instanceMetadata - Instance metadata
 * @returns {string[]}
 */
function readDimensionIndexPointers(instanceMetadata) {
  const sequence = getList(instanceMetadata, Tags.DimensionIndexSequence);
  if (!Array.isArray(sequence)) {
    return [];
  }
  const pointers = [];
  for (const item of sequence) {
    const pointer = getValue(item, Tags.DimensionIndexPointer);
    const formatted = formatTagPointer(pointer);
    if (formatted) {
      pointers.push(formatted);
    }
  }
  return pointers;
}

/**
 * Formats an AT value as `(gggg,eeee)`. DICOM JSON carries AT as the 8 hex digit string.
 * @param {*} pointer - The AT value
 * @returns {string|undefined}
 */
function formatTagPointer(pointer) {
  if (typeof pointer !== 'string' || pointer.length !== 8) {
    return undefined;
  }
  return `(${pointer.slice(0, 4).toLowerCase()},${pointer.slice(4).toLowerCase()})`;
}

/**
 * Groups frames by spatial position along the normal, ordered by increasing distance.
 *
 * The grouping tolerance is derived from the smallest gap present rather than fixed, so a
 * sub-millimetre stack is not collapsed into one group and a 10mm stack does not split on
 * floating point noise in the stored decimal strings.
 *
 * @param {FrameRef[]} frames - Frames with distance set
 * @returns {Array<{distance: number, frames: FrameRef[]}>}
 */
function groupByDistance(frames) {
  const sorted = [...frames].sort((a, b) => a.distance - b.distance);
  let smallestGap = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].distance - sorted[i - 1].distance;
    if (gap > 1e-6 && gap < smallestGap) {
      smallestGap = gap;
    }
  }
  const tolerance = Number.isFinite(smallestGap) ? smallestGap / 4 : 1e-3;

  const groups = [];
  for (const frame of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(frame.distance - last.distance) <= tolerance) {
      last.frames.push(frame);
      continue;
    }
    groups.push({ distance: frame.distance, frames: [frame] });
  }
  return groups;
}

/**
 * @param {string} reason - Why the series cannot be bricked
 * @param {Object} [base] - Partial geometry gathered before the check failed
 * @returns {SeriesGeometry}
 */
function ineligible(reason, base = {}) {
  return { eligible: false, reason, frames: [], totalFrames: 0, ...base };
}

/**
 * @param {*} value - A DICOM DS/IS value, possibly a single value or an array of strings
 * @returns {number[]|undefined}
 */
function numberList(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const list = (Array.isArray(value) ? value : [value]).map(Number);
  return list.some(entry => !Number.isFinite(entry)) ? undefined : list;
}

/**
 * @param {Object} [item] - A DICOM JSON item
 * @param {string} tag - Sequence tag
 * @returns {Object|undefined} - The first item of the sequence
 */
function getSequenceItem(item, tag) {
  if (!item) {
    return undefined;
  }
  const sequence = getList(item, tag);
  return Array.isArray(sequence) ? sequence[0] : undefined;
}

/**
 * Tags.getValue on an item that may be absent - the resolution walk it does for private tags
 * indexes the item unconditionally, so it needs a real object.
 * @param {Object} [item] - A DICOM JSON item
 * @param {string} tag - Tag to read
 * @returns {*} - The value, or undefined
 */
function valueOf(item, tag) {
  return item ? getValue(item, tag) : undefined;
}

/**
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number[]} - a x b
 */
function crossProduct(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} - a . b
 */
function dotProduct(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number[]} - a - b
 */
function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * @param {number[]} a - Vector
 * @param {number} factor - Scalar
 * @returns {number[]} - a * factor
 */
function scale(a, factor) {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

/**
 * @param {number[]} a - Vector
 * @returns {number} - |a|
 */
function magnitude(a) {
  return Math.sqrt(dotProduct(a, a));
}

/**
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @param {number} tolerance - Per component tolerance
 * @returns {boolean}
 */
function vectorsClose(a, b, tolerance) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
}

/**
 * @param {number[]} values - Values to take the median of
 * @returns {number} - The median, or NaN for an empty list
 */
function median(values) {
  if (values.length === 0) {
    return NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
