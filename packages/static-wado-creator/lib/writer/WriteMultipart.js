const { v4: uuid } = require('uuid');

const WriteMultipart = async (writeStream, contentType, content) => {
  const boundaryId = uuid();
  await writeStream.write(`--BOUNDARY_${boundaryId}\r\n`);
  await writeStream.write(contentType);
  await writeStream.write("\r\n");
  await writeStream.write(content);
  await writeStream.write(`\r\n--BOUNDARY_${boundaryId}--`);
};

module.exports = WriteMultipart;
