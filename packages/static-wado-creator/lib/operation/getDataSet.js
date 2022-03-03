const getVR = require("./getVR");
const getValue = require("./getValue");
const Tags = require("../dictionary/Tags");

/**
 * Get dataset.
 *
 * ParentAttr is used to control root/non-root attr scenarios (such as pixel data).
 *
 * @param {*} dataSet
 * @param {*} callback
 * @param {*} options
 * @param {*} parentAttr Parent reference for sequence element tags.
 * @returns
 */
async function getDataSet(dataSet, callback, options, parentAttr = undefined) {
  const metadata = {};

  // iterate over dataSet attributes in order
  for (const tag in dataSet.elements) {
    // Raw versions have the x in front of them
    if (tag != Tags.RawTransferSyntaxUID && tag >= Tags.RawMinTag && tag < Tags.RawFirstBodyTag) {
      continue;
    }
    const attr = dataSet.elements[tag];
    /* eslint-disable-next-line no-use-before-define */
    await attributeToJS(metadata, tag, dataSet, attr, callback, options, parentAttr);
  }
  if (metadata[Tags.TransferSyntaxUID]) {
    // console.log(`Found tsuid ${JSON.stringify(metadata[Tags.TransferSyntaxUID])} assigning to ${Tags.AvailableTransferSyntaxUID}`)
    metadata[Tags.AvailableTransferSyntaxUID] = metadata[Tags.TransferSyntaxUID];
    delete metadata[Tags.TransferSyntaxUID];
  }
  return { metadata };
}

async function attributeToJS(metadataSrc, tag, dataSet, attr, callback, options, parentAttr) {
  const metadata = metadataSrc;
  const vr = getVR(attr);
  const value = await getValue(dataSet, attr, vr, getDataSet, callback, options, parentAttr);
  const key = tag.substring(1).toUpperCase();
  if (value === undefined || value === null || value.length === 0) {
    if (!vr) return;
    metadata[key] = {
      vr,
    };
  } else if (value.InlineBinary || value.BulkDataURI) {
    metadata[key] = {
      vr,
      ...value,
    };
  } else {
    metadata[key] = {
      vr,
      Value: value,
    };
  }
}

module.exports = getDataSet;
