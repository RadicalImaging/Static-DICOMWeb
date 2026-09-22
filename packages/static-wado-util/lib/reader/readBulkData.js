const fsBase = require('fs');
const { promises: fs } = fsBase;
const path = require('path');
const zlib = require('zlib');
const util = require('util');
const handleHomeRelative = require('../handleHomeRelative');

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

/**
 * Finds where the payload ends, by locating the closing boundary rather than assuming the
 * footer's length.
 *
 * The two writers in this repository disagree about the footer: create-dicomweb's
 * MultipartStreamWriter ends with `\r\n--BOUNDARY--\r\n`, while static-wado-creator's
 * WriteMultipart omits the trailing CRLF. Assuming either one truncates or over-reads the
 * other by two bytes, and for a JPEG family codestream those two bytes are the EOI marker, so
 * the frame fails to decode rather than merely looking odd.
 *
 * @param {Buffer|Uint8Array} data - The whole multipart file
 * @param {Buffer|Uint8Array} separator - The opening boundary line, `--BOUNDARY...`
 * @param {number} from - Index the payload starts at
 * @returns {number} - Index one past the last payload byte, or -1 when no closing boundary
 */
const findPayloadEnd = (data, separator, from) => {
  for (let i = data.length - separator.length; i >= from; i--) {
    if (!checkToken(separator, data, i)) {
      continue;
    }
    // The boundary is introduced by a CRLF that is part of the delimiter, not the payload
    if (i >= from + 2 && data[i - 2] === 0x0d && data[i - 1] === 0x0a) {
      return i - 2;
    }
    return i;
  }
  return -1;
};

const getSeparator = data => {
  if (data[0] !== 0x2d || data[1] !== 0x2d) {
    console.log('data not multipart', data[0], data[1], typeof data);
    return null;
  }
  const endSeparator = findIndexOfString(data, '\r\n', 0);
  if (!endSeparator) {
    console.log('No end to separator', String(data.slice(0, 55)));
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
  if (fsBase.existsSync(pathName + '.gz')) {
    pathName = pathName + '.gz';
  }
  try {
    const rawdata = await fs.readFile(pathName);
    if (pathName.indexOf('.gz') != -1) {
      data = await gunzip(rawdata, {});
    } else {
      data = rawdata;
    }
  } catch (err) {
    console.log("Couldn't read", dir, name, err);
    return null;
  }
  const separator = getSeparator(data);
  let contentType = 'application/octet-stream';
  let transferSyntaxUid = null;
  if (!separator) {
    return {
      binaryData: data.buffer,
      contentType,
      transferSyntaxUid,
    };
  }

  const startData = 4 + findIndexOfString(data, '\r\n\r\n');
  const foundEnd = findPayloadEnd(data, separator, startData);
  if (foundEnd === -1) {
    console.warn(
      `Multipart file ${pathName} has no closing boundary; falling back to a fixed footer length`
    );
  }
  // Fall back to the historical assumption - \r\n--BOUNDARY--\r\n, i.e. separator.length + 6 -
  // only when the closing boundary cannot be found at all.
  const endData = foundEnd === -1 ? data.length - separator.length - 6 : foundEnd;
  const header = data.buffer.slice(separator.length, startData);
  const headerStr = new TextDecoder('utf-8').decode(header).replaceAll('\r', '');
  const headerSplit = headerStr.split('\n');

  for (const headerItem of headerSplit) {
    if (headerItem.startsWith('Content-Type')) {
      const semi = headerItem.indexOf(';');
      contentType = headerItem.substring(14, semi !== -1 ? semi : undefined).trim();
      const transferSyntaxStart = headerItem.indexOf('transfer-syntax=');
      if (transferSyntaxStart !== -1) {
        // Extract transfer syntax, handling potential trailing parameters or whitespace
        let tsValue = headerItem.substring(transferSyntaxStart + 16);
        // Remove any trailing semicolons, parameters, or whitespace
        const nextSemi = tsValue.indexOf(';');
        if (nextSemi !== -1) {
          tsValue = tsValue.substring(0, nextSemi);
        }
        transferSyntaxUid = tsValue.trim();
      }
      console.noQuiet('Bulkdata content type', `"${contentType}"`, `"${transferSyntaxUid}"`);
    }
  }

  const binaryData = data.buffer.slice(startData, endData);

  return { binaryData, contentType, transferSyntaxUid };
};

module.exports = readBulkData;
