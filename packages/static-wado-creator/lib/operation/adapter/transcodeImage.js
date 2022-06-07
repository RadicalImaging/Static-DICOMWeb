const dicomCodec = require("@cornerstonejs/dicom-codec");
const Tags = require("../../dictionary/Tags");
const getImageInfo = require("./getImageInfo");

const transcodeOp = {
  none: 0,
  decodeOnly: 1,
  encodeOnly: 2,
  transcode: 3, // decode and then encode
};

/**
 * Static mapping for transcoding decoders
 */
const transcodeMap = {
  "1.2.840.10008.1.2": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.transcode,
    alias: "uncompressed",
  },
  "1.2.840.10008.1.2.1": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.transcode,
    alias: "uncompressed",
  },
  "1.2.840.10008.1.2.2": {
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    transcodeOp: transcodeOp.decodeOnly,
    alias: "uncompressed",
  },
  "1.2.840.10008.1.2.4.57": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.transcode,
    alias: "jpeglossless",
  },
  "1.2.840.10008.1.2.4.70": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.transcode,
    alias: "jpeglossless",
  },
  "1.2.840.10008.1.2.4.90": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.transcode,
    alias: "jp2",
  },
  "1.2.840.10008.1.2.4.91": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.transcode,
    alias: "jp2",
  },
  "1.2.840.10008.1.2.5": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.transcode,
    alias: "rle",
  },
};

/**
 * Return a existing transcoder for the given transferSyntaxUid. Otherwise it returns undefined.
 *
 * @param {*} transferSyntaxUid
 * @returns
 */
function getTranscoder(transferSyntaxUid) {
  return transcodeMap[transferSyntaxUid];
}

/**
 * Tell whether given id contain transferSyntaxUid which can be transcoded or not.
 * @param {*} id object containing transferSyntaxUid
 * @param {*} options runner options
 */
function shouldTranscodeImageFrame(id, options) {
  if (!options.recompress) {
    return false;
  }

  function isValidTranscoder() {
    const { transferSyntaxUid } = id;
    const transcoder = getTranscoder(transferSyntaxUid);

    return transcoder && transcoder.transferSyntaxUid && options.recompress.includes(transcoder.alias);
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
    const transcoder = getTranscoder(transferSyntaxUid);
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

  const transcoder = getTranscoder(id.transferSyntaxUid);

  // last chance to prevent transcoding
  if (targetId.transferSyntaxUid !== transcoder.transferSyntaxUid) {
    return {
      id,
      imageFrame,
      done: false,
    };
  }

  console.log("Transcoding to", transcoder.transferSyntaxUid);
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
      case transcodeOp.encodeOnly:
        transcodeLog(options, `Encoding image to \x1b[43m${targetId.transferSyntaxUid}\x1b[0m`);

        result = await dicomCodec.encode(imageFrame, imageInfo, targetId.transferSyntaxUid);

        processResultMsg = `Encoding finished`;
        break;
      case transcodeOp.decodeOnly:
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
  const { transferSyntaxUid } = getTranscoder(id.transferSyntaxUid);

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
    result[Tags.AvailableTransferSyntaxUID].Value = [transcodedId.transferSyntaxUid];
  }

  return result;
}

exports.shouldTranscodeImageFrame = shouldTranscodeImageFrame;
exports.shouldThumbUseTranscoded = shouldThumbUseTranscoded;
exports.transcodeId = transcodeId;
exports.transcodeImageFrame = transcodeImageFrame;
exports.transcodeMetadata = transcodeMetadata;
