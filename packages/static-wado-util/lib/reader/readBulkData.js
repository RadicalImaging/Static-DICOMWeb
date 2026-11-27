const fsBase = require('fs');
const { promises: fs } = fsBase;
const path = require('path');
const zlib = require('zlib');
const util = require('util');
const handleHomeRelative = require('../handleHomeRelative');
const { unwrapMultipart } = require('../storageFormat/multipart.mjs');

const gunzip = util.promisify(zlib.gunzip);

/**
 * Copies part of a Buffer into its own ArrayBuffer.
 * Node Buffers under 4k are allocated out of a shared pool, so `buf.buffer` is the whole
 * pool and `buf.buffer.slice(start, end)` reads whatever else happens to live at those
 * offsets. Small bulkdata/frame files hit that case, so the byteOffset has to be added.
 * @param {Buffer} buf - Source buffer
 * @param {number} start - Start offset within buf
 * @param {number} end - End offset within buf
 * @returns {ArrayBuffer}
 */
function sliceToArrayBuffer(buf, start, end) {
  return buf.buffer.slice(buf.byteOffset + start, buf.byteOffset + end);
}

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
  const parts = unwrapMultipart(data);
  if (!parts?.length) {
    console.log('data not multipart', data[0], data[1], typeof data);
    return {
      binaryData: sliceToArrayBuffer(data, 0, data.length),
      contentType: 'application/octet-stream',
      transferSyntaxUid: null,
    };
  }

  const [{ body, contentType, transferSyntaxUid }] = parts;
  console.noQuiet('Bulkdata content type', `"${contentType}"`, `"${transferSyntaxUid}"`);
  return { binaryData: sliceToArrayBuffer(body, 0, body.length), contentType, transferSyntaxUid };
};

module.exports = readBulkData;
