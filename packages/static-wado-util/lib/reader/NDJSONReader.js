const fs = require("fs");
const path = require("path");
const ndjson = require("ndjson");
const handleHomeRelative = require("../handleHomeRelative");

const NDJSONReader = async (dirSrc, name, def) => {
  const dir = handleHomeRelative(dirSrc);
  return new Promise((resolve, reject) => {
    try {
      const ret = [];
      const stream = fs.createReadStream(path.join(dir, name)).pipe(ndjson.parse());
      stream.on("data", (it) => ret.push(it));
      stream.on("end", () => resolve(ret));
    } catch (err) {
      if (def === undefined) {
        console.log("Couldn't read", dir, name, err);
        reject("Couldn't read");
        return;
      }
      resolve(def);
    }
  });
};

module.exports = NDJSONReader;
