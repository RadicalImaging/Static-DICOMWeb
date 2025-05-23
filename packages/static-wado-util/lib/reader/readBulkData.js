const fs = require("fs").promises;
const path = require("path");
const zlib = require("zlib");
const util = require("util");
const handleHomeRelative = require("../handleHomeRelative");

const gunzip = util.promisify(zlib.gunzip);

function checkToken(token, data, dataOffset) {
  if (dataOffset + token.length > data.length) {
    return false;
  }

  let endIndex = dataOffset;

  for (let i = 0; i < token.length; i++) {
    if (token[i] !== data[endIndex++]) {
      return false;
    }
  }

  return true;
}

function stringToUint8Array(str) {
  const uint = new Uint8Array(str.length);

  for (let i = 0, j = str.length; i < j; i++) {
    uint[i] = str.charCodeAt(i);
  }

  return uint;
}

function findIndexOfString(data, str, offset = 0) {
  const token = stringToUint8Array(str);

  for (let i = offset; i < data.length; i++) {
    if (token[0] === data[i]) {
      // console.log('match @', i);
      if (checkToken(token, data, i)) {
        return i;
      }
    }
  }

  return -1;
}

const getSeparator = (data) => {
  if (data[0] !== 0x2d || data[1] !== 0x2d) {
    console.log("data not multipart", data);
    return null;
  }
  const endSeparator = findIndexOfString(data, "\r\n", 0);
  if (!endSeparator) {
    console.log("No end to separator", String(data.slice(0, 55)));
    return null;
  }
  const separator = data.slice(0, endSeparator);
  return separator;
};

const readBulkData = async (dirSrc, baseName, frame) => {
  let data;
  const dir = handleHomeRelative(dirSrc);
  const name = frame ? `${baseName}/${frame}.mht` : baseName;
  try {
    const rawdata = await fs.readFile(path.join(dir, name));
    if (name.indexOf(".gz") != -1) {
      data = (await gunzip(rawdata, {})).toString("utf-8");
    } else {
      data = rawdata;
    }
  } catch (err) {
    console.log("Couldn't read", dir, name, err);
    return null;
  }
  const separator = getSeparator(data);
  if (!separator) return data.buffer;

  const startData = 4 + findIndexOfString(data, "\r\n\r\n");
  const endData = data.length - separator.length - 2;
  return data.buffer.slice(startData, endData);
};

module.exports = readBulkData;
