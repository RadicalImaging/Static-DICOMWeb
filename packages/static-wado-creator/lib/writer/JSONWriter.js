const { Stats } = require("@ohif/static-wado-util");
const path = require("path");
const WriteStream = require("./WriteStream");

/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */
const JSONWriter = async (dir, name, data, options = { gzip: true, brotli: false, index: true }) => {
  const fileName = options.index ? "index.json.gz" : name + ((options.gzip && ".gz") || (options.brotli && ".br") || "");
  const dirName = options.index ? path.join(dir, name) : dir;
  const writeStream = WriteStream(dirName, fileName, {
    ...options,
    mkdir: true,
  });
  await writeStream.write(JSON.stringify(data));
  await writeStream.close();
  Stats.StudyStats.add("Write JSON", `Write JSON file ${name}`, 1000);
};

module.exports = JSONWriter;
