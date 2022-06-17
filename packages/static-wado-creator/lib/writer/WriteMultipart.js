const { v4: uuid } = require("uuid");

const WriteMultipart = async (writeStream, headers, content) => {
  const boundaryId = uuid();
  await writeStream.write(`--BOUNDARY_${boundaryId}\r\n`);
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    await writeStream.write(`${header.headerName}: ${header.headerValue}`);
    if (header.attributes) {
      for (let j = 0; j < header.attributes.length; j++) {
        const attribute = header.attributes[j];
        await writeStream.write(`;${attribute.attributeName}=${attribute.attributeValue}`);
      }
    }
    await writeStream.write("\r\n");
  }
  await writeStream.write("\r\n");
  await writeStream.write(content);
  await writeStream.write(`\r\n--BOUNDARY_${boundaryId}--`);
};

module.exports = WriteMultipart;
