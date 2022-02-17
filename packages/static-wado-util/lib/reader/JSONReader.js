const fs = require("fs").promises;
const path = require("path");
const zlib = require("zlib");
const util = require("util");
const handleHomeRelative = require("../handleHomeRelative");

const gunzip = util.promisify(zlib.gunzip);
const { Stats } = require("../stats");

const JSONReader = async (dirSrc, name, def) => {
  let finalData;
  const dir = handleHomeRelative(dirSrc);
  try {
    const rawdata = await fs.readFile(path.join(dir, name));
    if (name.indexOf(".gz") != -1) {
      finalData = (await gunzip(rawdata, {})).toString("utf-8");
    } else {
      finalData = rawdata;
    }
  } catch (err) {
    console.log("Couldn't read", dir, name, err);
  }
  Stats.StudyStats.add("Read JSON", `Read JSON file ${name}`, 1000);
  return (finalData && JSON.parse(finalData)) || def;
};

/** Calls the JSON reader on the path appropriate for the given hash data */
JSONReader.readHashData = async (
  studyDir,
  hashValue,
  extension = ".json.gz"
) => {
  const hashPath = path.join(
    studyDir,
    "bulkdata",
    hashValue.substring(0, 3),
    hashValue.substring(3, 5)
  );
  Stats.StudyStats.add("Read Hash Data", "Read hash data", 100);
  return JSONReader(hashPath, hashValue.substring(5) + extension);
};

module.exports = JSONReader;
