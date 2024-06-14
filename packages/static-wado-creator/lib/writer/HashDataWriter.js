const hashFactory = require("node-object-hash");
const { createHash } = require("crypto");

const path = require("path");
const { Tags } = require("@radicalimaging/static-wado-util");
const WriteStream = require("./WriteStream");
const WriteMultipart = require("./WriteMultipart");
const ExpandUriPath = require("./ExpandUriPath");
const { MultipartHeader } = require("./MultipartHeader");

// Extensions for encapsulated content.  Do NOT add any executable content extensions here.
const extensions = {
  "application/pdf": ".pdf",
  "text/json": ".json",
  "application/xml+cda": ".cda.xml",
};

const baseHasher = hashFactory.hasher();

const hasher = {
  hash: (v) => {
    const type = v.constructor?.name;
    if (type === "Buffer") {
      return createHash("sha256").update(v).digest("hex");
    }
    return baseHasher.hash(v);
  },
};

/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */
const HashDataWriter =
  (options) =>
  async (id, key, data, additionalOptions = {}) => {
    const isRaw = ArrayBuffer.isView(data);
    const { mimeType } = additionalOptions;
    // If the file has an extension, it should be directly accessible as that file type.
    const gzip = !isRaw || (data.length > 1024 && !mimeType);
    const { dirName, fileName } = HashDataWriter.createHashPath(data, options);
    const absolutePath = path.join(id.studyPath, dirName);
    const rawData = isRaw ? data : JSON.stringify(data, null, 1);
    const writeStream = WriteStream(absolutePath, fileName, {
      mkdir: true,
      gzip,
    });
    if (isRaw) {
      await WriteMultipart(writeStream, [new MultipartHeader("Content-Type", "application/octet-stream")], rawData);
    } else {
      await writeStream.write(rawData);
    }
    await writeStream.close();
    return ExpandUriPath(id, `${dirName}/${fileName}`, options);
  };

/**
 * Returns a hash path relative to the objectUID directory.
 */
HashDataWriter.createHashPath = (data, options = {}) => {
  const { mimeType } = options;
  const isRaw = ArrayBuffer.isView(data);
  const extension = isRaw ? (mimeType && extensions[mimeType]) || "" : ".json";
  const hashValue = Tags.getValue(data, Tags.DeduppedHash) || hasher.hash(data);

  return {
    // Use string concat as this value is used for the BulkDataURI which needs forward slashes
    dirName: `bulkdata/${hashValue.substring(0, 3)}/${hashValue.substring(3, 5)}`,
    fileName: hashValue.substring(5) + extension,
  };
};

module.exports = HashDataWriter;
