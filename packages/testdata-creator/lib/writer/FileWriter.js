const WriteStream = require("./WriteStream");

const FileWriter = (options) => async (fileName, buffer) => {
  const { directoryName } = options;
  console.log("directoryName file", directoryName);
  const writeStream = WriteStream(directoryName, fileName, {
    mkdir: true,
  });

  console.log("wrote file");
  await writeStream.write(buffer);

  console.verbose("Wrote buffer to", directoryName, fileName);
  return writeStream.close();
};

module.exports = FileWriter;
