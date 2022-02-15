const uids = require("../model/uids");
const WriteStream = require("./WriteStream");

const ImageFrameWriter = (options) => {
  const { verbose } = options;

  return async (id, index, imageFrame) => {
    const { transferSyntaxUid } = id;
    const type = uids[transferSyntaxUid] || uids.default;
    const contentType = `Content-Type: ${type.contentType};transfer-syntax=${transferSyntaxUid}\r\n`;
    const writeStream = WriteStream(id.imageFrameRootPath, `${1 + index}`, {
      gzip: type.gzip,
      mkdir: true,
    });
    await writeStream.write("--BOUNDARY_FIXED_32934857949532587\r\n");
    await writeStream.write(contentType);
    // await writeStream.write(`Content-Length: ${imageFrame.length}\r\n\r\n`);
    await writeStream.write("\r\n");

    // node api accepts writing from Uint8Array or Buffer
    if (imageFrame instanceof Uint8Array) {
      await writeStream.write(imageFrame);
    } else {
      await writeStream.write(Buffer.from(imageFrame.buffer));
    }
    await writeStream.write("\r\n--BOUNDARY_FIXED_32934857949532587--");
    await writeStream.close();
    if (verbose) console.log("Wrote image frame", id.sopInstanceUid, index + 1);
    return `instances/${id.sopInstanceUid}/frames`;
  };
};

module.exports = ImageFrameWriter;
