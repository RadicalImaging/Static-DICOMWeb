const uids = require("../model/uids");
const WriteStream = require("./WriteStream");
const WriteMultipart = require("./WriteMultipart");
const ExpandUriPath = require("./ExpandUriPath");
const { MultipartHeader, MultipartAttribute } = require("./MultipartHeader");

const ImageFrameWriter = (options) => {
  const { verbose } = options;

  return async (id, index, imageFrame) => {
    const { transferSyntaxUid } = id;
    const type = uids[transferSyntaxUid] || uids.default;
    const writeStream = WriteStream(id.imageFrameRootPath, `${1 + index}`, {
      gzip: type.gzip,
      mkdir: true,
    });
    let content;
    if (imageFrame instanceof Uint8Array) {
      content = imageFrame;
    } else {
      content = Buffer.from(imageFrame.buffer);
    }
    await WriteMultipart(writeStream, [new MultipartHeader("Content-Type", type.contentType, [new MultipartAttribute("transfer-syntax", transferSyntaxUid)])], content);
    await writeStream.close();
    if (verbose) console.log("Wrote image frame", id.sopInstanceUid, index + 1);
    const includeSeries = true;
    return ExpandUriPath(id, `instances/${id.sopInstanceUid}/frames`, { includeSeries, ...options});
  };
};

module.exports = ImageFrameWriter;
