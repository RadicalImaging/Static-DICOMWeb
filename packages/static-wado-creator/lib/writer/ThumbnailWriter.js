const WriteStream = require("./WriteStream");

const ThumbnailWriter = (options) => {
  const { verbose } = options;

  return async (filePath, fileName, thumbBuffer) => {
    const writeStream = WriteStream(filePath, fileName, {
      mkdir: true,
    });

    await writeStream.write(thumbBuffer);

    await writeStream.close();

    if (verbose) {
      console.log("Wrote thumbnail frame", filePath, fileName);
    }
  };
};

module.exports = ThumbnailWriter;
