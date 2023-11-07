const uids = require("../model/uids");
const WriteStream = require("./WriteStream");
const WriteMultipart = require("./WriteMultipart");
const ExpandUriPath = require("./ExpandUriPath");
const { MultipartHeader, MultipartAttribute } = require("./MultipartHeader");

const ImageFrameWriter = (options) => {
  const { encapsulatedImage, singlePartImage } = options;
  return async (id, index, imageFrame) => {
    const { transferSyntaxUid } = id;
    const type = uids[transferSyntaxUid] || uids.default;
    const extension = type.extension;
    let content;
    if (imageFrame instanceof Uint8Array) {
      content = imageFrame;
    } else {
      content = Buffer.from(imageFrame.buffer);
    }

    if (encapsulatedImage || !extension) {
      const writeStream = WriteStream(id.imageFrameRootPath, `${1 + index}.mht`, {
        gzip: type.gzip,
        mkdir: true,
      });
      await WriteMultipart(
        writeStream,
        [new MultipartHeader("Content-Type", type.contentType, [new MultipartAttribute("transfer-syntax", transferSyntaxUid)])],
        content
      );
      await writeStream.close();
      console.verbose("Wrote encapsulated image frame", id.sopInstanceUid, index + 1, type.contentType);
    }
    if (extension && singlePartImage) {
      const writeStreamSingle = WriteStream(id.imageFrameRootPath, `${1 + index}${extension}`, {
        gzip: type.gzip,
        mkdir: true,
      });
      await writeStreamSingle.write(content);
      await writeStreamSingle.close();
      console.verbose("Wrote single part image frame", id.sopInstanceUid, index + 1, extension);
    }
    const includeSeries = true;
    return ExpandUriPath(id, `instances/${id.sopInstanceUid}/frames`, { includeSeries, ...options });
  };
};

module.exports = ImageFrameWriter;
