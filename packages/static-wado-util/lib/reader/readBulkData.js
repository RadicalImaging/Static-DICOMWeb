const fsBase = require("fs");
const { promises: fs } = fsBase;
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
    console.log("data not multipart", data[0], data[1], typeof data);
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
  let pathName = path.join(dir, name);
  if (fsBase.existsSync(pathName + ".gz")) {
    pathName = pathName + ".gz";
  }
  try {
    const rawdata = await fs.readFile(pathName);
    if (pathName.indexOf(".gz") != -1) {
      data = await gunzip(rawdata, {});
    } else {
      data = rawdata;
    }
  } catch (err) {
    console.log("Couldn't read", dir, name, err);
    return null;
  }
  const separator = getSeparator(data);
  let contentType = "application/octet-stream";
  let transferSyntaxUid = null;
  if (!separator) {
    return {
      binaryData: data.buffer,
      contentType,
      transferSyntaxUid,
    };
  }

  const startData = 4 + findIndexOfString(data, "\r\n\r\n");
  const endData = data.length - separator.length - 2;
  const header = data.buffer.slice(separator.length, startData);
  const headerStr = new TextDecoder("utf-8")
    .decode(header)
    .replaceAll("\r", "");
  const headerSplit = headerStr.split("\n");

  for (const headerItem of headerSplit) {
    if (headerItem.startsWith("Content-Type")) {
      const semi = headerItem.indexOf(";");
      contentType = headerItem.substring(14, semi);
      const transferSyntaxStart = headerItem.indexOf("transfer-syntax=");
      if (transferSyntaxStart !== -1) {
        transferSyntaxUid = headerItem.substring(transferSyntaxStart + 16);
      }
      console.noQuiet(
        "Bulkdata content type",
        `"${contentType}"`,
        `"${transferSyntaxUid}"`
      );
    }
  }

  const binaryData = data.buffer.slice(startData, endData);

  return { binaryData, contentType, transferSyntaxUid };
};

module.exports = readBulkData;
