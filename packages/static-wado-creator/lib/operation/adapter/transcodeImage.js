const dicomCodec = require("@cornerstonejs/dicom-codec");
const { Tags } = require("@radicalimaging/static-wado-util");
const getImageInfo = require("./getImageInfo");

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
    transferSyntaxUid: "1.2.840.10008.1.2.4.96",
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
  "1.2.840.10008.1.2.4.57": {
    transcodeOp: transcodeOp.decode,
    alias: "jpeglossless",
  },
  "1.2.840.10008.1.2.4.70": {
    transcodeOp: transcodeOp.decode,
    alias: "jpeglossless",
  },
  "1.2.840.10008.1.2.4.90": {
    transcodeOp: transcodeOp.decode,
    alias: "jp2",
  },
  "1.2.840.10008.1.2.4.91": {
    transcodeOp: transcodeOp.decode,
    alias: "jp2",
  },
  "1.2.840.10008.1.2.4.96": {
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
function getTranscoder(transferSyntaxUid, { contentType, verbose }) {
  if (verbose) {
    console.log(`getTranscoder for ${transferSyntaxUid}`);
  }
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
function shouldTranscodeImageFrame(id, options) {
  const { recompress } = options;
  if (!recompress) {
    return false;
  }

  function isValidTranscoder() {
    const { transferSyntaxUid } = id;
    const transcoder = getTranscoder(transferSyntaxUid, options);
    return transcoder && transcoder.transferSyntaxUid && (recompress.includes("true") || recompress.includes(transcoder.alias));
  }

  return isValidTranscoder();
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
    const transcoder = getTranscoder(transferSyntaxUid, options);
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

  if (!shouldTranscodeImageFrame(id, options)) {
    return {
      id,
      imageFrame,
      done: false,
    };
  }

  const transcoder = getTranscoder(id.transferSyntaxUid, options);

  // last chance to prevent transcoding
  if (targetId.transferSyntaxUid !== transcoder.transferSyntaxUid) {
    return {
      id,
      imageFrame,
      done: false,
    };
  }

  if (options.verbose) {
    console.log("Transcoding to", transcoder.transferSyntaxUid);
  }
  const imageInfo = getImageInfo(dataSet);
  let done = false;
  let processResultMsg = "";

  try {
    switch (transcoder.transcodeOp) {
      case transcodeOp.transcode:
        transcodeLog(options, `Full transcoding image from \x1b[43m${id.transferSyntaxUid}\x1b[0m to \x1b[43m${targetId.transferSyntaxUid}\x1b[0m`);

        result = await dicomCodec.transcode(imageFrame, imageInfo, id.transferSyntaxUid, targetId.transferSyntaxUid);

        processResultMsg = `Transcoding finished`;
        break;
      case transcodeOp.encode:
        transcodeLog(options, `Encoding image to \x1b[43m${targetId.transferSyntaxUid}\x1b[0m`);

        result = await dicomCodec.encode(imageFrame, imageInfo, targetId.transferSyntaxUid);

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

  return {
    id: targetId,
    imageFrame: _imageFrame,
    done,
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
function transcodeId(id, options) {
  if (!shouldTranscodeImageFrame(id, options)) {
    return id;
  }

  const targetId = { ...id };
  const { transferSyntaxUid } = getTranscoder(id.transferSyntaxUid, options);

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
  if (!shouldTranscodeImageFrame(id, options)) {
    return metadata;
  }

  const transcodedId = transcodeId(id, options);

  const result = { ...metadata };

  if (result[Tags.AvailableTransferSyntaxUID]) {
    Tags.setValue(result, Tags.AvailableTransferSyntaxUID, transcodedId.transferSyntaxUid);
  }

  return result;
}

exports.shouldTranscodeImageFrame = shouldTranscodeImageFrame;
exports.shouldThumbUseTranscoded = shouldThumbUseTranscoded;
exports.transcodeId = transcodeId;
exports.getDestinationTranscoder = getDestinationTranscoder;
exports.transcodeImageFrame = transcodeImageFrame;
exports.transcodeMetadata = transcodeMetadata;
