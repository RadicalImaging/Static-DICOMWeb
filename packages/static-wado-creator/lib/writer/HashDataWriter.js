const hashFactory = require("node-object-hash");

const hasher = hashFactory();
const path = require("path");
const Tags = require("../dictionary/Tags");
const WriteStream = require("./WriteStream");

// Extensions for encapsulated content.  Do NOT add any executable content extensions here.
const extensions = {
  "application/pdf": ".pdf",
  "text/json": ".json",
  "application/xml+cda": ".cda.xml",
};

/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */
const HashDataWriter =
  () =>
  async (id, key, data, options = {}) => {
    const isRaw = ArrayBuffer.isView(data);
    const { mimeType } = options;
    // If the file has an extension, it should be directly accessible as that file type.
    const gzip = !isRaw || (data.length > 1024 && !mimeType);
    const { dirName, fileName } = HashDataWriter.createHashPath(data, options);
    const absolutePath = path.join(id.studyPath, dirName);
    const rawData = isRaw ? data : JSON.stringify(data, null, 1);
    const writeStream = WriteStream(absolutePath, fileName, {
      mkdir: true,
      gzip,
    });
    await writeStream.write(rawData);
    await writeStream.close();
    return `${dirName}/${fileName}`;
  };

/**
 * Returns a hash path relative to the objectUID directory.
 */
HashDataWriter.createHashPath = (data, options = {}) => {
  const { mimeType } = options;
  const isRaw = ArrayBuffer.isView(data);
  const extension = isRaw ? (mimeType && extensions[mimeType]) || "" : ".json";
  const existingHash = data[Tags.DeduppedHash];
  const hashValue = (existingHash && existingHash.Value[0]) || hasher.hash(data);
  return {
    // Use string concat as this value is used for the BulkDataURI which needs forward slashes
    dirName: `bulkdata/${hashValue.substring(0, 3)}/${hashValue.substring(3, 5)}`,
    fileName: hashValue.substring(5) + extension,
  };
};

module.exports = HashDataWriter;
