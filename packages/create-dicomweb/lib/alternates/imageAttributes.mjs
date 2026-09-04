import {
  Tags,
  createPixelValueModel,
  isSegmentationLabelMap,
} from '@radicalimaging/static-wado-util';

const { getValue, getList } = Tags;

/** JPEG-LS lossless - the transfer syntax the frame renditions this module writes use */
export const JLS_LOSSLESS_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.4.80';

/** High-Throughput JPEG 2000, lossless only - the alternative brick encoding */
export const HTJ2K_LOSSLESS_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.4.201';

/**
 * High-Throughput JPEG 2000, lossy allowed. `.202` is the RPCL *lossless* syntax despite what
 * `transcodeImage.js`'s `jhc-lossy` destination claims, so the lossy rendition uses `.203`,
 * which is also what `uids` marks lossy.
 */
export const HTJ2K_LOSSY_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.4.203';

/**
 * Transfer syntaxes whose frames hold native pixel data, i.e. the ones `transcode` is
 * willing to re-encode. Deflated explicit VR is native as far as the frame files go: the
 * deflate applies to the data set, so what was written to `frames/` is inflated pixels.
 */
export const UNCOMPRESSED_TRANSFER_SYNTAX_UIDS = Object.freeze([
  '1.2.840.10008.1.2', // Implicit VR Little Endian
  '1.2.840.10008.1.2.1', // Explicit VR Little Endian
  '1.2.840.10008.1.2.2', // Explicit VR Big Endian (retired)
  '1.2.840.10008.1.2.1.99', // Deflated Explicit VR Little Endian
]);

const UNCOMPRESSED_SET = new Set(UNCOMPRESSED_TRANSFER_SYNTAX_UIDS);

/** Photometric interpretations that are single sample grayscale */
const GRAYSCALE_PHOTOMETRIC_INTERPRETATIONS = new Set(['MONOCHROME1', 'MONOCHROME2']);

/**
 * Tells whether an instance's samples are segment labels rather than quantities, in which case
 * reduction picks a representative label instead of averaging. See isSegmentationLabelMap.
 * @param {ImageAttributes} attributes - Image attributes
 * @returns {boolean}
 */
export function isLabelMap(attributes) {
  return isSegmentationLabelMap(attributes.sopClassUid, attributes.segmentationType);
}

/**
 * Tells whether a transfer syntax carries native, uncompressed pixel data.
 * @param {string} transferSyntaxUid - Transfer Syntax UID
 * @returns {boolean}
 */
export function isUncompressedTransferSyntax(transferSyntaxUid) {
  return UNCOMPRESSED_SET.has(transferSyntaxUid);
}

/**
 * Image attributes needed to decode, filter and re-encode an instance's frames.
 * @typedef {Object} ImageAttributes
 * @property {number} rows
 * @property {number} columns
 * @property {number} bitsAllocated
 * @property {number} bitsStored
 * @property {number} highBit
 * @property {number} samplesPerPixel
 * @property {number} pixelRepresentation
 * @property {boolean} signed
 * @property {string} photometricInterpretation
 * @property {number} numberOfFrames
 * @property {string|undefined} transferSyntaxUid
 * @property {number|undefined} pixelPaddingValue
 * @property {number|undefined} pixelPaddingRangeLimit
 * @property {string|undefined} sopClassUid
 * @property {string|undefined} segmentationType
 */

/**
 * Reads the image attributes out of instance metadata.
 * @param {Object} instanceMetadata - DICOM JSON instance metadata
 * @returns {ImageAttributes}
 */
export function getImageAttributes(instanceMetadata) {
  const bitsAllocated = numberOr(getValue(instanceMetadata, Tags.BitsAllocated), 16);
  const bitsStored = numberOr(getValue(instanceMetadata, Tags.BitsStored), bitsAllocated);
  const pixelRepresentation = numberOr(getValue(instanceMetadata, Tags.PixelRepresentation), 0);

  return {
    rows: numberOr(getValue(instanceMetadata, Tags.Rows), 0),
    columns: numberOr(getValue(instanceMetadata, Tags.Columns), 0),
    bitsAllocated,
    bitsStored,
    highBit: numberOr(getValue(instanceMetadata, Tags.HighBit), bitsStored - 1),
    samplesPerPixel: numberOr(getValue(instanceMetadata, Tags.SamplesPerPixel), 1),
    pixelRepresentation,
    signed: pixelRepresentation === 1,
    photometricInterpretation: getValue(instanceMetadata, Tags.PhotometricInterpretation),
    numberOfFrames: numberOr(getValue(instanceMetadata, Tags.NumberOfFrames), 1),
    // The frame multipart header is authoritative and overrides this once a frame is read;
    // this is the metadata's own claim about how the frames were written.
    transferSyntaxUid:
      getValue(instanceMetadata, Tags.AvailableTransferSyntaxUID) ||
      getValue(instanceMetadata, Tags.TransferSyntaxUID),
    pixelPaddingValue: numberOrUndefined(getValue(instanceMetadata, Tags.PixelPaddingValue)),
    pixelPaddingRangeLimit: numberOrUndefined(
      getValue(instanceMetadata, Tags.PixelPaddingRangeLimit)
    ),
    // Needed to tell a label map from an image; see isLabelMap
    sopClassUid: getValue(instanceMetadata, Tags.SOPClassUID),
    segmentationType: getValue(instanceMetadata, Tags.SegmentationType),
    // [row spacing, column spacing] per DICOM, so y before x. The brick pyramid needs it to
    // decide which axes a level reduces: a scalar downsample factor is only right for isotropic
    // voxels.
    pixelSpacing: readPixelSpacing(instanceMetadata),
  };
}

/**
 * PixelSpacing, from the instance or from its shared PixelMeasuresSequence.
 * @param {Object} instanceMetadata - DICOM JSON instance metadata
 * @returns {number[]|undefined} - [rowSpacing, columnSpacing]
 */
function readPixelSpacing(instanceMetadata) {
  const shared = getList(instanceMetadata, Tags.SharedFunctionalGroupsSequence)?.[0];
  const measures = shared ? getList(shared, Tags.PixelMeasuresSequence)?.[0] : undefined;
  const raw =
    getValue(instanceMetadata, Tags.PixelSpacing) ??
    (measures ? getValue(measures, Tags.PixelSpacing) : undefined);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const values = (Array.isArray(raw) ? raw : [raw]).map(Number);
  if (values.length < 2 || values.some(value => !Number.isFinite(value) || value <= 0)) {
    return undefined;
  }
  return [values[0], values[1]];
}

/**
 * Tells whether the attributes describe single sample grayscale pixel data.
 * @param {ImageAttributes} attributes - Image attributes
 * @returns {boolean}
 */
export function isGrayscale(attributes) {
  if (attributes.samplesPerPixel !== 1) {
    return false;
  }
  // MONOCHROME1/2 is required for grayscale; PALETTE COLOR is also one sample per pixel but
  // its samples are indices into a lookup table, so averaging or re-encoding them as
  // grayscale would be meaningless.
  return GRAYSCALE_PHOTOMETRIC_INTERPRETATIONS.has(attributes.photometricInterpretation);
}

/**
 * Sample depths the JPEG-LS and HTJ2K encoders accept. Segmentation bitmaps (BitsAllocated 1)
 * and floating point pixel data (32) have no representation in either, so an instance carrying
 * them cannot be given an encoded rendition however grayscale it is.
 */
export const JLS_SUPPORTED_BITS_ALLOCATED = Object.freeze([8, 16]);

/**
 * Tells whether an instance's pixel data can be re-encoded into a frame rendition or a brick.
 * @param {ImageAttributes} attributes - Image attributes
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canEncodeGrayscaleFrames(attributes) {
  if (!isGrayscale(attributes)) {
    return {
      ok: false,
      reason: `not grayscale (SamplesPerPixel ${attributes.samplesPerPixel}, PhotometricInterpretation ${attributes.photometricInterpretation ?? 'absent'})`,
    };
  }
  if (!JLS_SUPPORTED_BITS_ALLOCATED.includes(attributes.bitsAllocated)) {
    return {
      ok: false,
      reason: `BitsAllocated ${attributes.bitsAllocated} is outside the ${JLS_SUPPORTED_BITS_ALLOCATED.join('/')} the encoders support`,
    };
  }
  return { ok: true };
}

/**
 * Tells whether an instance is uncompressed grayscale, which is what `transcode --to jls`
 * accepts: a native transfer syntax, one sample per pixel, and a monochrome photometric
 * interpretation.
 * @param {ImageAttributes} attributes - Image attributes
 * @param {string} [transferSyntaxUid] - Transfer syntax to test, defaults to the attributes'
 * @returns {{ ok: boolean, reason?: string }}
 */
export function isUncompressedGrayscale(attributes, transferSyntaxUid) {
  const tsuid = transferSyntaxUid ?? attributes.transferSyntaxUid;
  if (!isUncompressedTransferSyntax(tsuid)) {
    return { ok: false, reason: `transfer syntax ${tsuid ?? 'unknown'} is not uncompressed` };
  }
  if (attributes.samplesPerPixel !== 1) {
    return { ok: false, reason: `SamplesPerPixel is ${attributes.samplesPerPixel}, not 1` };
  }
  if (!GRAYSCALE_PHOTOMETRIC_INTERPRETATIONS.has(attributes.photometricInterpretation)) {
    return {
      ok: false,
      reason: `PhotometricInterpretation is ${attributes.photometricInterpretation ?? 'absent'}, not MONOCHROME1/MONOCHROME2`,
    };
  }
  if (!JLS_SUPPORTED_BITS_ALLOCATED.includes(attributes.bitsAllocated)) {
    return {
      ok: false,
      reason: `BitsAllocated ${attributes.bitsAllocated} is outside the ${JLS_SUPPORTED_BITS_ALLOCATED.join('/')} JPEG-LS supports`,
    };
  }
  return { ok: true };
}

/**
 * Builds the imageInfo object the dicom-codec encoders and decoders expect.
 * @param {ImageAttributes} attributes - Image attributes
 * @param {Object} [override] - Values to override, e.g. reduced rows/columns
 * @returns {Object} - imageInfo for dicom-codec
 */
export function toImageInfo(attributes, override = {}) {
  return {
    rows: attributes.rows,
    columns: attributes.columns,
    bitsAllocated: attributes.bitsAllocated,
    samplesPerPixel: attributes.samplesPerPixel,
    signed: attributes.signed,
    pixelRepresentation: attributes.pixelRepresentation,
    ...override,
  };
}

/**
 * Builds the pixel value model for these attributes, so filtering averages true values and
 * leaves padding out.
 * @param {ImageAttributes} attributes - Image attributes
 * @returns {Object} - PixelValueModel
 */
export function toPixelValueModel(attributes) {
  return createPixelValueModel({
    bitsAllocated: attributes.bitsAllocated,
    bitsStored: attributes.bitsStored,
    highBit: attributes.highBit,
    pixelRepresentation: attributes.pixelRepresentation,
    samplesPerPixel: attributes.samplesPerPixel,
    pixelPaddingValue: attributes.pixelPaddingValue,
    pixelPaddingRangeLimit: attributes.pixelPaddingRangeLimit,
    sopClassUid: attributes.sopClassUid,
    segmentationType: attributes.segmentationType,
  });
}

/**
 * Returns the typed array constructor for these attributes' samples.
 * @param {ImageAttributes} attributes - Image attributes
 * @returns {Function} - Typed array constructor
 */
export function pixelArrayType(attributes) {
  const { bitsAllocated, signed } = attributes;
  if (bitsAllocated === 32) {
    return Float32Array;
  }
  if (bitsAllocated <= 8) {
    return signed ? Int8Array : Uint8Array;
  }
  return signed ? Int16Array : Uint16Array;
}

/**
 * Reinterprets raw little-endian pixel bytes as a typed array of samples.
 *
 * Copies only when the byte offset cannot host the element alignment, which a typed array
 * constructor refuses outright.
 *
 * @param {Function} ArrayType - Typed array constructor, from pixelArrayType
 * @param {Uint8Array} bytes - Raw little endian pixel bytes
 * @returns {ArrayBufferView}
 */
export function viewPixelBytes(ArrayType, bytes) {
  const elementSize = ArrayType.BYTES_PER_ELEMENT;
  if (elementSize === 1) {
    return new ArrayType(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (bytes.byteOffset % elementSize === 0) {
    return new ArrayType(bytes.buffer, bytes.byteOffset, bytes.byteLength / elementSize);
  }
  const aligned = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new ArrayType(aligned, 0, bytes.byteLength / elementSize);
}

/**
 * Uncompressed size of a set of frames, i.e. the denominator of a compression ratio.
 *
 * Computed in bits and rounded up per frame, because sub-byte depths are real: a 1 bit
 * segmentation frame occupies rows*columns/8 bytes, and charging it a byte a sample would
 * credit it with an eightfold compression ratio it never earned.
 *
 * @param {Object} dims - { rows, columns, frames, bitsAllocated, samplesPerPixel }
 * @returns {number} - Bytes
 */
export function uncompressedBytes({ rows, columns, frames, bitsAllocated, samplesPerPixel }) {
  return Math.ceil((rows * columns * samplesPerPixel * bitsAllocated) / 8) * frames;
}

/**
 * @param {*} value - Value to coerce
 * @param {number} defaultValue - Fallback
 * @returns {number}
 */
function numberOr(value, defaultValue) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : defaultValue;
}

/**
 * @param {*} value - Value to coerce
 * @returns {number|undefined}
 */
function numberOrUndefined(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
