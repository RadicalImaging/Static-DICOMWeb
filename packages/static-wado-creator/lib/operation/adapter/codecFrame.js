const dicomCodec = require('@cornerstonejs/dicom-codec');
const codecFactory = require('@cornerstonejs/dicom-codec/src/codecs/codecFactory');

dicomCodec.setConfig('verbose: false');

/** JPEG-LS lossless */
const JLS_LOSSLESS_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.4.80';

/** High-Throughput JPEG 2000, lossless only */
const HTJ2K_LOSSLESS_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.4.201';

/** High-Throughput JPEG 2000, lossy allowed */
const HTJ2K_LOSSY_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.4.203';

/**
 * Quantization step for the lossy HTJ2K encoding, matching what `transcode`'s `jhc-lossy`
 * destination asks openjph for. Smaller keeps more; this is a visually lossless setting rather
 * than an aggressive one.
 */
const HTJ2K_LOSSY_QUANTIZATION_STEP = 0.002;

/** Explicit VR Big Endian (retired) - stored pixel data is byte swapped */
const BIG_ENDIAN_TRANSFER_SYNTAX_UID = '1.2.840.10008.1.2.2';

/**
 * Transfer syntaxes whose frames hold native (unencapsulated) pixel data. Deflated explicit
 * VR is included because the deflate applies to the data set, not the frame: what lands in
 * the DICOMweb frame files is already inflated native pixel data.
 */
const UNCOMPRESSED_TRANSFER_SYNTAX_UIDS = Object.freeze([
  '1.2.840.10008.1.2', // Implicit VR Little Endian
  '1.2.840.10008.1.2.1', // Explicit VR Little Endian
  BIG_ENDIAN_TRANSFER_SYNTAX_UID,
  '1.2.840.10008.1.2.1.99', // Deflated Explicit VR Little Endian
]);

const UNCOMPRESSED_SET = new Set(UNCOMPRESSED_TRANSFER_SYNTAX_UIDS);

/**
 * Tells whether a transfer syntax carries native, uncompressed pixel data.
 * @param {string} transferSyntaxUid - Transfer Syntax UID
 * @returns {boolean}
 */
function isUncompressedTransferSyntax(transferSyntaxUid) {
  return UNCOMPRESSED_SET.has(transferSyntaxUid);
}

/**
 * Returns a byte view of a typed pixel array, which is the form the encoders want:
 * dicom-codec copies the caller's array into the encoder's decoded buffer with
 * `set()`, and that buffer is a byte buffer, so handing it 16 bit samples truncates
 * every one of them.
 * @param {ArrayBufferView} pixelArray - Typed pixel array
 * @returns {Uint8Array}
 */
function toPixelBytes(pixelArray) {
  if (pixelArray instanceof Uint8Array) {
    return pixelArray;
  }
  return new Uint8Array(pixelArray.buffer, pixelArray.byteOffset, pixelArray.byteLength);
}

/**
 * Copies a codec result out of the WASM heap.
 *
 * dicom-codec deletes the encoder/decoder instance before it returns, and the typed array it
 * hands back is a view into that instance's buffer, so the bytes are already freed memory by
 * the time the caller sees them. openjph reuses the block immediately - the codestream a caller
 * reads back starts with the allocator's own pointers rather than the SOC marker - while charls
 * happens to leave it intact. Copying here makes the result the caller's own either way.
 *
 * @param {ArrayBufferView} view - Typed array view into codec memory
 * @returns {Uint8Array} - An independent copy
 */
function copyFromCodec(view) {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

/**
 * Makes the WASM decoders hand back memory they still own.
 *
 * `codecFactory.decode` reads the decoded buffer, deletes the decoder, and only then returns a
 * view of it - so freeing has already written the allocator's free-list header over the first
 * bytes of the image. On a 512x512 CT frame that surfaces as the first four samples coming back
 * as pointer values instead of pixels, which is corruption a size or ratio check cannot see.
 *
 * The encoders take settings through a `beforeEncode` hook, but there is no decode equivalent,
 * so the decoder class is swapped for the duration of the call with one whose instances queue
 * their delete instead of performing it. Only the WASM codecs (JPEG-LS, JPEG 2000, HTJ2K,
 * libjpeg-turbo) route through here; the pure JS ones build their result inline and are
 * untouched. Patching one seam beats reimplementing the decode path for every transfer syntax.
 */
const originalFactoryDecode = codecFactory.decode;
codecFactory.decode = function decodeThenRelease(context, codecConfig, imageFrame, imageInfo) {
  const RealDecoder = codecConfig.Decoder;
  const pendingDeletes = [];
  codecConfig.Decoder = function DeferredDeleteDecoder() {
    const instance = new RealDecoder();
    const release = instance.delete.bind(instance);
    instance.delete = () => pendingDeletes.push(release);
    return instance;
  };

  try {
    const result = originalFactoryDecode(context, codecConfig, imageFrame, imageInfo);
    return { ...result, imageFrame: copyFromCodec(result.imageFrame) };
  } finally {
    // The swap spans a synchronous call, so nothing else can observe the substituted class
    codecConfig.Decoder = RealDecoder;
    for (const release of pendingDeletes) {
      release();
    }
  }
};

/**
 * Swaps 16 bit samples in place, for big endian source data.
 * @param {Uint8Array} bytes - Pixel bytes to swap
 * @returns {Uint8Array} - The same array, swapped
 */
function swapBytes16(bytes) {
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const low = bytes[i];
    bytes[i] = bytes[i + 1];
    bytes[i + 1] = low;
  }
  return bytes;
}

/**
 * Decodes one frame to raw little-endian pixel bytes.
 *
 * Native transfer syntaxes are returned untouched (big endian is byte swapped into a copy);
 * everything else goes through the dicom-codec decoder for its transfer syntax.
 *
 * @param {Uint8Array|Buffer} frameBytes - The frame as stored (codestream, or native pixels)
 * @param {Object} imageInfo - { rows, columns, bitsAllocated, samplesPerPixel, signed, pixelRepresentation }
 * @param {string} transferSyntaxUid - Transfer Syntax UID of frameBytes
 * @returns {Promise<Uint8Array>} - Raw pixel bytes, little endian
 */
async function decodeFrameToBytes(frameBytes, imageInfo, transferSyntaxUid) {
  if (transferSyntaxUid === BIG_ENDIAN_TRANSFER_SYNTAX_UID) {
    const copy = Uint8Array.prototype.slice.call(frameBytes);
    return imageInfo.bitsAllocated === 16 ? swapBytes16(copy) : copy;
  }
  if (isUncompressedTransferSyntax(transferSyntaxUid)) {
    return frameBytes instanceof Uint8Array ? frameBytes : new Uint8Array(frameBytes);
  }
  // Already an owned copy for the WASM codecs; the pure JS ones return arrays they built
  const decoded = await dicomCodec.decode(frameBytes, imageInfo, transferSyntaxUid);
  const { imageFrame } = decoded;
  return imageFrame instanceof Uint8Array
    ? imageFrame
    : new Uint8Array(imageFrame.buffer, imageFrame.byteOffset, imageFrame.byteLength);
}

/**
 * Encoder settings that make each target transfer syntax encode the way its name promises.
 *
 * The encoders are told explicitly rather than trusted to default correctly: charls takes a
 * near-lossless delta and openjph takes a reversible flag with a quantization step, and neither
 * is implied by the transfer syntax the caller named.
 */
const DEFAULT_ENCODE_OPTIONS = {
  [JLS_LOSSLESS_TRANSFER_SYNTAX_UID]: { beforeEncode: encoder => encoder.setNearLossless(0) },
  [HTJ2K_LOSSLESS_TRANSFER_SYNTAX_UID]: { beforeEncode: encoder => encoder.setQuality(true, -1) },
  [HTJ2K_LOSSY_TRANSFER_SYNTAX_UID]: {
    beforeEncode: encoder => encoder.setQuality(false, HTJ2K_LOSSY_QUANTIZATION_STEP),
  },
};

/**
 * Encodes raw pixel data to a codestream.
 *
 * With no options the transfer syntax picks the encoder settings - reversible for the lossless
 * syntaxes, the default quantization step for the lossy one; pass options to drive the encoder
 * yourself.
 *
 * @param {ArrayBufferView} pixelData - Raw pixels, typed array or byte view
 * @param {Object} imageInfo - { rows, columns, bitsAllocated, samplesPerPixel, signed, pixelRepresentation }
 * @param {string} transferSyntaxUid - Target Transfer Syntax UID
 * @param {Object} [options] - dicom-codec encode options, e.g. { beforeEncode }
 * @returns {Promise<Uint8Array>} - The encoded codestream
 */
async function encodeFrameFromPixelData(pixelData, imageInfo, transferSyntaxUid, options) {
  const encodeOptions = options ?? DEFAULT_ENCODE_OPTIONS[transferSyntaxUid] ?? {};

  // dicom-codec deletes the encoder before it returns, and the codestream it returns is a view
  // into that encoder's buffer, so by then the bytes are freed WASM memory: openjph reuses the
  // block for its own allocator bookkeeping and the "codestream" starts with pointers instead
  // of the SOC marker. The only hook into the encoder's lifetime is beforeEncode, so the delete
  // is held off there and run here, once the bytes have been copied out.
  let encoder;
  let releaseEncoder;
  const beforeEncode = (instance, codecConfig) => {
    encoder = instance;
    const originalDelete = instance.delete.bind(instance);
    releaseEncoder = () => {
      delete instance.delete;
      originalDelete();
    };
    instance.delete = () => {};
    encodeOptions.beforeEncode?.(instance, codecConfig);
  };

  try {
    const encoded = await dicomCodec.encode(toPixelBytes(pixelData), imageInfo, transferSyntaxUid, {
      ...encodeOptions,
      beforeEncode,
    });
    return copyFromCodec(encoded.imageFrame);
  } finally {
    if (encoder) {
      releaseEncoder();
    }
  }
}

module.exports = {
  JLS_LOSSLESS_TRANSFER_SYNTAX_UID,
  HTJ2K_LOSSLESS_TRANSFER_SYNTAX_UID,
  HTJ2K_LOSSY_TRANSFER_SYNTAX_UID,
  HTJ2K_LOSSY_QUANTIZATION_STEP,
  UNCOMPRESSED_TRANSFER_SYNTAX_UIDS,
  isUncompressedTransferSyntax,
  toPixelBytes,
  decodeFrameToBytes,
  encodeFrameFromPixelData,
};
