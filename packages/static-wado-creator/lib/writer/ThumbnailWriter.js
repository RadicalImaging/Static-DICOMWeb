const WriteStream = require("./WriteStream");

const ThumbnailWriter = () => async (filePath, fileName, thumbBuffer) => {
  const writeStream = WriteStream(filePath, fileName, {
    mkdir: true,
  });

  await writeStream.write(thumbBuffer);

  console.verbose("Wrote thumbnail frame", filePath, fileName);
  return writeStream.close();
};

module.exports = ThumbnailWriter;
