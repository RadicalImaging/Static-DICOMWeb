/**
 * How a stored sample maps to its true pixel value, and which values are padding.
 *
 * Two things make averaging pixel data more than a mean over typed array elements:
 *
 * - **The stored word is not always the value.** With BitsStored < BitsAllocated the value
 *   occupies bits `[HighBit - BitsStored + 1 .. HighBit]`, and for signed data the sign bit
 *   is HighBit rather than the top bit of the word - so reading a 12 bit signed sample
 *   straight out of an Int16Array gives the wrong number whenever the source did not
 *   sign extend.
 * - **Padding is not image content.** PixelPaddingValue (0028,0120), optionally widened to a
 *   range by PixelPaddingRangeLimit (0028,0121), marks samples that exist only to fill the
 *   rectangle out to Rows x Columns. Averaging them in drags real values towards the padding
 *   value, which paints a halo along every padded edge - visible as a bright or dark border
 *   creeping inwards as the reduction factor grows.
 * - **Some samples are not quantities at all.** In a label map the value is a segment
 *   identifier, so the mean of segments 1 and 3 is segment 2 - a different structure, in a
 *   place neither segment occupies. `isLabelMap` switches reduction from averaging to picking
 *   a representative sample.
 *
 * @typedef {Object} PixelValueModel
 * @property {number} bitsStored - Bits per sample actually used
 * @property {boolean} signed - True when PixelRepresentation is 1
 * @property {number} min - Smallest representable value
 * @property {number} max - Largest representable value
 * @property {boolean} isIdentity - True when stored words are already the values
 * @property {boolean} hasPadding - True when a padding value or range is declared
 * @property {number|undefined} paddingValue - Normalized padding value, if declared
 * @property {boolean} isLabelMap - True when samples are labels rather than quantities
 * @property {(raw: number) => number} normalize - Stored word to true value
 * @property {(value: number) => number} pack - True value to stored word
 * @property {(value: number) => boolean} isPadding - True when a normalized value is padding
 */

/**
 * SOP Classes whose pixel data is segment identifiers rather than measurements.
 */
const SEGMENTATION_SOP_CLASS_UIDS = new Set([
  '1.2.840.10008.5.1.4.1.1.66.4', // Segmentation Storage
  '1.2.840.10008.5.1.4.1.1.66.7', // Label Map Segmentation Storage
]);

/**
 * Tells whether an instance's samples are segment labels rather than quantities.
 *
 * FRACTIONAL segmentations are excluded deliberately: their samples are occupancy fractions,
 * which are quantities, so averaging them is exactly right - it is BINARY and LABELMAP whose
 * values only identify a segment. A segmentation with no SegmentationType is treated as a
 * label map, because binary is the common case and averaging labels is the worse mistake.
 *
 * @param {string} [sopClassUid] - SOP Class UID (0008,0016)
 * @param {string} [segmentationType] - Segmentation Type (0062,0001)
 * @returns {boolean}
 */
function isSegmentationLabelMap(sopClassUid, segmentationType) {
  if (!SEGMENTATION_SOP_CLASS_UIDS.has(sopClassUid)) {
    return false;
  }
  return segmentationType !== 'FRACTIONAL';
}

/**
 * Builds a PixelValueModel from image attributes.
 *
 * Every field is optional; the defaults describe the ordinary case where the stored word is
 * the value and nothing is padding, in which case `isIdentity` is true and callers can skip
 * normalize/pack entirely.
 *
 * @param {Object} [info] - Image attributes
 * @param {number} [info.bitsAllocated=16] - Bits Allocated (0028,0100)
 * @param {number} [info.bitsStored] - Bits Stored (0028,0101); defaults to bitsAllocated
 * @param {number} [info.highBit] - High Bit (0028,0102); defaults to bitsStored - 1
 * @param {number} [info.pixelRepresentation=0] - Pixel Representation (0028,0103)
 * @param {number} [info.samplesPerPixel=1] - Samples Per Pixel (0028,0002)
 * @param {number} [info.pixelPaddingValue] - Pixel Padding Value (0028,0120)
 * @param {number} [info.pixelPaddingRangeLimit] - Pixel Padding Range Limit (0028,0121)
 * @param {string} [info.sopClassUid] - SOP Class UID (0008,0016)
 * @param {string} [info.segmentationType] - Segmentation Type (0062,0001)
 * @param {boolean} [info.isLabelMap] - Overrides the SOP Class derived label map decision
 * @returns {PixelValueModel}
 */
function createPixelValueModel(info = {}) {
  const bitsAllocated = toInt(info.bitsAllocated, 16);
  const samplesPerPixel = toInt(info.samplesPerPixel, 1);
  const signed = toInt(info.pixelRepresentation, 0) === 1;

  // Floating point pixel data carries values directly; there is nothing to unpack.
  const isFloat = bitsAllocated === 32;

  let bitsStored = toInt(info.bitsStored, bitsAllocated);
  if (bitsStored < 1 || bitsStored > bitsAllocated) {
    bitsStored = bitsAllocated;
  }
  let highBit = toInt(info.highBit, bitsStored - 1);
  if (highBit < bitsStored - 1 || highBit > bitsAllocated - 1) {
    highBit = bitsStored - 1;
  }
  const shift = isFloat ? 0 : highBit + 1 - bitsStored;

  const span = 2 ** bitsStored;
  const mask = span - 1;
  const signSpan = span / 2;
  const min = isFloat ? -Infinity : signed ? -signSpan : 0;
  const max = isFloat ? Infinity : signed ? signSpan - 1 : mask;

  const isIdentity = isFloat || (shift === 0 && bitsStored === bitsAllocated);

  const normalize = isIdentity
    ? value => value
    : raw => {
        const stored = (raw >> shift) & mask;
        return signed && stored >= signSpan ? stored - span : stored;
      };

  const pack = isIdentity
    ? value => value
    : value => {
        const clamped = value < min ? min : value > max ? max : value;
        // Mask before shifting so the bits outside [HighBit-BitsStored+1 .. HighBit] stay
        // zero, which is what PS3.5 requires of the unused bits of a stored sample.
        return ((clamped < 0 ? clamped + span : clamped) & mask) << shift;
      };

  // Padding applies to grayscale only - for colour, (0028,0120) has no defined meaning.
  const rawPadding =
    samplesPerPixel === 1 ? toNumberOrUndefined(info.pixelPaddingValue) : undefined;
  const rawRangeLimit =
    rawPadding === undefined ? undefined : toNumberOrUndefined(info.pixelPaddingRangeLimit);

  const paddingValue = normalizeDeclaredValue(rawPadding, signed, span, max);
  const rangeLimit = normalizeDeclaredValue(rawRangeLimit, signed, span, max);

  const hasPadding = paddingValue !== undefined;
  let isPadding;
  if (!hasPadding) {
    isPadding = () => false;
  } else if (rangeLimit === undefined) {
    isPadding = value => value === paddingValue;
  } else {
    // PS3.3 C.7.5.1.1.2: the padding range is the values between and including the two
    // attributes, in whichever order they were given.
    const low = Math.min(paddingValue, rangeLimit);
    const high = Math.max(paddingValue, rangeLimit);
    isPadding = value => value >= low && value <= high;
  }

  return {
    bitsAllocated,
    bitsStored,
    highBit,
    signed,
    samplesPerPixel,
    min,
    max,
    isIdentity,
    hasPadding,
    paddingValue,
    paddingRangeLimit: rangeLimit,
    isLabelMap: info.isLabelMap ?? isSegmentationLabelMap(info.sopClassUid, info.segmentationType),
    normalize,
    pack,
    isPadding,
  };
}

/**
 * Reads a declared attribute value into the same signed/unsigned domain as normalized samples.
 * PixelPaddingValue is US or SS according to PixelRepresentation, but files that store the
 * unsigned bit pattern for signed data are common enough to be worth handling.
 * @param {number|undefined} value - Declared value
 * @param {boolean} signed - Whether samples are signed
 * @param {number} span - 2 ** bitsStored
 * @param {number} max - Largest representable value
 * @returns {number|undefined}
 */
function normalizeDeclaredValue(value, signed, span, max) {
  if (value === undefined) {
    return undefined;
  }
  if (signed && value > max) {
    return value - span;
  }
  return value;
}

/**
 * @param {*} value - Value to coerce
 * @param {number} defaultValue - Fallback when value is not a usable integer
 * @returns {number}
 */
function toInt(value, defaultValue) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : defaultValue;
}

/**
 * @param {*} value - Value to coerce
 * @returns {number|undefined} - The number, or undefined when absent or unusable
 */
function toNumberOrUndefined(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

module.exports = {
  createPixelValueModel,
  isSegmentationLabelMap,
};
