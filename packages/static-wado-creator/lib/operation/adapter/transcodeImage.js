const dicomCodec = require("@cornerstonejs/dicom-codec");
const { Tags, bilinear } = require("@radicalimaging/static-wado-util");
const getImageInfo = require("./getImageInfo");

dicomCodec.setConfig("verbose: false");

const transcodeOp = {
  none: 0,
  decode: 1,
  encode: 2,
  transcode: 3, // decode and then encode
};

/**
 * Static mapping for transcoding decoder destination names/uids - currently only lei, jls and jls-lossy appear to work.
 */
const transcodeDestinationMap = {
  lei: {
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    transcodeOp: transcodeOp.none,
  },
  jls: {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.encode,
  },
  "jls-lossy": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.81",
    transcodeOp: transcodeOp.encode,
  },
  jp2: {
    transferSyntaxUid: "1.2.840.10008.1.2.4.90",
    transcodeOp: transcodeOp.encode,
  },
  "jp2-lossy": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.91",
    transcodeOp: transcodeOp.encode,
  },
  jhc: {
    transferSyntaxUid: "3.2.840.10008.1.2.4.96",
    transcodeOp: transcodeOp.encode,
  },
  jpeg: {
    transferSyntaxUid: "1.2.840.10008.1.2.4.50",
    transcodeOp: transcodeOp.encode,
  },
};

const transcodeSourceMap = {
  "1.2.840.10008.1.2": {
    transcodeOp: transcodeOp.decode,
    alias: "uncompressed",
  },
  "1.2.840.10008.1.2.1": {
    transcodeOp: transcodeOp.none,
    alias: "uncompressed",
  },
  "1.2.840.10008.1.2.2": {
    transcodeOp: transcodeOp.decode,
    alias: "uncompressed",
  },
  "1.2.840.10008.1.2.4.50": {
    transcodeOp: transcodeOp.decode,
    alias: "jpeg",
  },
  "1.2.840.10008.1.2.4.57": {
    transcodeOp: transcodeOp.decode,
    alias: "jls",
  },
  "1.2.840.10008.1.2.4.70": {
    transcodeOp: transcodeOp.decode,
    alias: "jpll",
  },
  "1.2.840.10008.1.2.4.80": {
    transcodeOp: transcodeOp.decode,
    alias: "jls",
  },
  "1.2.840.10008.1.2.4.90": {
    transcodeOp: transcodeOp.decode,
    alias: "jp2",
  },
  "1.2.840.10008.1.2.4.91": {
    transcodeOp: transcodeOp.decode,
    alias: "jp2",
  },
  "3.2.840.10008.1.2.4.96": {
    transcodeOp: transcodeOp.decode,
    alias: "jhc",
  },
  "1.2.840.10008.1.2.5": {
    transcodeOp: transcodeOp.decode,
    alias: "rle",
  },
};

/**
 * Get an existing destination transcoder from destination map.
 *
 * @param {*} id Destination type to compress to
 * @returns A partial transcoder definition. Otherwise it returns undefined.
 */
function getDestinationTranscoder(id) {
  const destinationTranscoderEntry = Object.entries(transcodeDestinationMap).find(([key, value]) => key === id || value.transferSyntaxUid === id);
  if (destinationTranscoderEntry) {
    return destinationTranscoderEntry[1];
  }
  return undefined;
}

/**
 * Return a merged source and destination transcoder for the given transferSyntaxUid. Otherwise it returns undefined.
 *
 * @param {*} transferSyntaxUid
 * @returns
 */
function getTranscoder(transferSyntaxUid, { contentType: greyContentType, colorContentType }, samplesPerPixel) {
  const contentType = samplesPerPixel === 3 ? colorContentType : greyContentType;
  const sourceTranscoder = transcodeSourceMap[transferSyntaxUid];
  const destinationTranscoder = getDestinationTranscoder(contentType);
  if (!sourceTranscoder || !destinationTranscoder) {
    return undefined;
  }

  return {
    transferSyntaxUid: destinationTranscoder.transferSyntaxUid,
    transcodeOp: sourceTranscoder.transcodeOp | destinationTranscoder.transcodeOp, // eslint-disable-line no-bitwise
    alias: sourceTranscoder.alias,
  };
}

/**
 * Tell whether given id contain transferSyntaxUid which can be transcoded or not.
 * @param {*} id object containing transferSyntaxUid
 * @param {*} options runner options
 */
function shouldTranscodeImageFrame(id, options, samplesPerPixel) {
  const { recompress: recompressGrey, recompressColor } = options;
  const recompress = samplesPerPixel === 3 ? recompressColor : recompressGrey;
  if (!recompress) {
    console.verbose("Not transcoding because recompress not set");
    return false;
  }

  const { transferSyntaxUid } = id;
  const transcoder = getTranscoder(transferSyntaxUid, options, samplesPerPixel);
  const validTranscoder = transcoder && transcoder.transferSyntaxUid;
  if (!validTranscoder) {
    console.verbose("Not transcoding because no decoder found for", transferSyntaxUid, samplesPerPixel);
    return false;
  }
  const validRecompress = recompress.includes("true") || recompress.includes(transcoder.alias);
  if (!validRecompress) {
    console.verbose("Not transcoding because recompress", recompress, "does not include", transcoder.alias);
    return false;
  }

  return true;
}

/**
 * It tells if we should use transcoded image to generate thumb or not.
 *
 * @param {*} id
 * @param {*} options
 * @returns True if transcoder.alias is present on intersection of recompressThumb and recompress options.
 */
function shouldThumbUseTranscoded(id, options) {
  if (!options.recompressThumb) {
    return false;
  }

  function isValidTranscoder() {
    const { transferSyntaxUid } = id;
    // Ignore the samples per pixel for thumbnails
    const transcoder = getTranscoder(transferSyntaxUid, options, "thumbnail");
    const result = transcoder && transcoder.transferSyntaxUid && options.recompress.includes(transcoder.alias) && options.recompressThumb.includes(transcoder.alias);

    return result;
  }

  return isValidTranscoder();
}

function transcodeLog(options, msg, error = "") {
  if (options.verbose) {
    console.log(`\x1b[34m${msg}\x1b[0m`, error);
  }
}

const beforeEncode = (options, encoder) => {
  if( !options.lossy ) return;
  console.log("encoder=", encoder);
  encoder.setQuality?.(false,options.lossyQuality || 0.0002);
  encoder.setNearLossless?.(options.lossyNearLossless || 2);
};

function scale(imageFrame, imageInfo) {
  const { rows, columns, bitsPerPixel, pixelRepresentation, samplesPerPixel } = imageInfo;
  let arrayConstructor = Float32Array;
  if (bitsPerPixel === 8) {
    arrayConstructor = pixelRepresentation ? Uint8Array : Int8Array;
  } else if (bitsPerPixel === 16) {
    arrayConstructor = pixelRepresentation ? Uint16Array : Int16Array;
  }
  const src = {
    data: imageFrame,
    rows,
    columns,
    samplesPerPixel,
  };
  const dest = {
    rows: 256,
    columns: Math.round(256 * columns / rows),
    samplesPerPixel,
  };
  dest.data = new arrayConstructor(dest.rows*dest.columns);
  bilinear(src, dest);

  return {
    imageFrame: dest.data,
    imageInfo: {
      ...imageInfo,
      ...dest,
      data: null,
    },
  };
}

/** Generates a lossy version of the image.
 * Options for lossy are:
 * * htj2k - generates a full resolution but high loss htj2k representation of the frames
 * * jls - generates a +/- 2 value, maximum 128 on an edge JLS representation
 * 
 * In either case, saves it to <sopUID>/fsiz/frameNo as multipart related
 */
async function generateLossyImage(id, decoded, options) {
  if( !options.alternate ) return;
  if( !decoded?.imageFrame ) return;

  let { imageFrame, imageInfo } = decoded;
  const lossyId = { 
    ...id,
    imageFrameRootPath: id.imageFrameRootPath.replace('frames', 'lossy'),
    transferSyntaxUid: transcodeDestinationMap.jhc.transferSyntaxUid,
  };
  const subOptions = {
    ...options,
    lossy: true,
  };

  if( options.alternateThumbnail && imageInfo.rows >= 512 ) {
    const scaled = scale(imageFrame, imageInfo);
    if( !scaled ) {
      console.log("Couldn't scale");
      return;
    }
    imageFrame = scaled.imageFrame;
    imageInfo = scaled.imageInfo;
  }

  if( options.alternate==="jls" ) {
    lossyId.transferSyntaxUid = transcodeDestinationMap["jls-lossy"].transferSyntaxUid;
  }

  console.log("Generating lossy image from", imageFrame.length);
  const encodeOptions = {
    beforeEncode: beforeEncode.bind(null, subOptions),
  }
  const lossyEncoding = await dicomCodec.encode(imageFrame, imageInfo, lossyId.transferSyntaxUid, encodeOptions);
  return { id: lossyId, imageFrame: lossyEncoding.imageFrame };
}

/**
 * Transcode imageFrame. It uses transcodeMap to define the target encoding based on source encoding.
 *
 * @param {*} id object containing transferSyntaxUid
 * @param {*} targetId target object containing transferSyntaxUid
 * @param {*} imageFrame data to be transcoded
 * @param {*} dataSet related image frame dataset
 * @param {*} options runner options
 * @returns object result for transcoding operation with id and image frame.
 */
async function transcodeImageFrame(id, targetIdSrc, imageFrame, dataSet, options = {}) {
  let targetId = targetIdSrc;
  let result = {};

  const samplesPerPixel = dataSet.uint16(Tags.RawSamplesPerPixel);
  const planarConfiguration = dataSet.uint16("x00280006");
  if (!shouldTranscodeImageFrame(id, options, samplesPerPixel) || planarConfiguration === 1) {
    console.verbose("Shouldn't transcode");
    return {
      id,
      imageFrame,
      done: false,
    };
  }

  const transcoder = getTranscoder(id.transferSyntaxUid, options, samplesPerPixel);

  // Don't transcode if not required
  if (targetId.transferSyntaxUid !== transcoder.transferSyntaxUid  && !options.forceTranscode) {
    console.verbose("Image is already in", targetId.transferSyntaxUid, "not transcoding");
    return {
      id,
      imageFrame,
      done: false,
    };
  }

  console.verbose("Transcoding to", transcoder.transferSyntaxUid);

  const imageInfo = getImageInfo(dataSet);
  let done = false;
  let processResultMsg = "";
  const encodeOptions = { beforeEncode: beforeEncode.bind(null, options) };
  let decoded;

  try {
    switch (transcoder.transcodeOp) {
      case transcodeOp.transcode:
        transcodeLog(options, `Full transcoding image from \x1b[43m${id.transferSyntaxUid}\x1b[0m to \x1b[43m${targetId.transferSyntaxUid}\x1b[0m`);

        decoded = await dicomCodec.decode(imageFrame, imageInfo, id.transferSyntaxUid);
        result = await dicomCodec.encode(decoded.imageFrame, decoded.imageInfo, targetId.transferSyntaxUid, encodeOptions);

        processResultMsg = `Transcoding finished`;
        break;
      case transcodeOp.encode:
        transcodeLog(options, `Encoding image to \x1b[43m${targetId.transferSyntaxUid}\x1b[0m`);

        result = await dicomCodec.encode(imageFrame, imageInfo, targetId.transferSyntaxUid, encodeOptions);

        processResultMsg = `Encoding finished`;
        break;
      case transcodeOp.decode:
        transcodeLog(options, `Decoding image from \x1b[43m${id.transferSyntaxUid}\x1b[0m`);
        result = await dicomCodec.decode(imageFrame, imageInfo, id.transferSyntaxUid);

        processResultMsg = `Decoding finished`;
        break;
      default:
        processResultMsg = "";
    }

    done = !!result.imageFrame;
  } catch (e) {
    transcodeLog(options, "Failed to transcode image", e);
  }

  // recover transfer syntax
  if (!done) {
    targetId = id;
  }

  // log final message only if resultMsg is present
  if (processResultMsg) {
    processResultMsg += done ? " successfully" : " unsuccessfully";
    transcodeLog(options, processResultMsg);
  }

  const _imageFrame = result.imageFrame ?? imageFrame;
  console.log("_imageFrame=", _imageFrame.length);

  return {
    id: targetId,
    imageFrame: _imageFrame,
    done,
    decoded,
  };
}

/**
 * Returns transcoded id object based on the given id's transferSyntaxUid. If transcoding should not occur it will return original id value.
 * It does not mutate id param.
 *
 * @param {*} id Object that contains (but not only) data transferSyntaxUid.
 * @param {*} options runner options.
 * @returns Transcoded id object
 */
function transcodeId(id, options, samplesPerPixel) {
  if (!shouldTranscodeImageFrame(id, options, samplesPerPixel)) {
    return id;
  }

  const targetId = { ...id };
  const { transferSyntaxUid } = getTranscoder(id.transferSyntaxUid, options, samplesPerPixel);

  targetId.transferSyntaxUid = transferSyntaxUid;

  return targetId;
}

/**
 * Returns transcoded metadata based on the given id's transferSyntaxUid.
 * Basically it changes the metadata AvailableTransferSyntaxUID tag's value to be transcodedId.transferSyntaxUid
 * If transcoding should not occur it will return original metadata value.
 *
 * It does not mutate metadata param.
 * @param {*} metadata Metadata object.
 * @param {*} id Object that contains (but not only) data transferSyntaxUid.
 * @param {*} options runner options.
 * @returns Transcoded metadata.
 */
function transcodeMetadata(metadata, id, options) {
  const samplesPerPixel = Tags.getValue(metadata, Tags.SamplesPerPixel);
  if (!shouldTranscodeImageFrame(id, options, samplesPerPixel)) {
    return metadata;
  }

  const transcodedId = transcodeId(id, options, samplesPerPixel);

  const result = { ...metadata };

  if (result[Tags.AvailableTransferSyntaxUID]) {
    Tags.setValue(result, Tags.AvailableTransferSyntaxUID, transcodedId.transferSyntaxUid);
    console.verbose("Apply available tsuid", transcodeId.transferSyntaxUid);
  }

  return result;
}

exports.shouldTranscodeImageFrame = shouldTranscodeImageFrame;
exports.shouldThumbUseTranscoded = shouldThumbUseTranscoded;
exports.transcodeId = transcodeId;
exports.getDestinationTranscoder = getDestinationTranscoder;
exports.transcodeImageFrame = transcodeImageFrame;
exports.transcodeMetadata = transcodeMetadata;
exports.generateLossyImage = generateLossyImage;