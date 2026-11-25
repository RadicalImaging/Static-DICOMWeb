const { createLatin1Decoder, PN_DELIMITER_BYTES } = require('@dcmjs-org/core');
const extractImageFrames = require('./extractImageFrames');

/** Without (0008,0005): WHATWG latin1 is windows-1252, which reads ASCII and the many sites that write 1252. */
const defaultDecoder = createLatin1Decoder();

/**
 * Decodes the bytes of a string element with the character set of the parse
 * (`options.charsetDecoder`, set by getDataSet). The decode happens before the
 * split on `\`, because a two-byte ISO 2022 character can hold the 0x5C byte.
 * Like dicom-parser `string()`, it stops at the first NUL and trims. Bad bytes
 * become U+FFFD; the decode never throws.
 */
const decodeString = (dataSet, attr, options, decodeOptions) => {
  const bytes = dataSet.byteArray.subarray(attr.dataOffset, attr.dataOffset + attr.length);
  const text = (options?.charsetDecoder || defaultDecoder).decode(bytes, decodeOptions);
  const nul = text.indexOf('\0');
  return (nul === -1 ? text : text.slice(0, nul)).trim();
};

const getValueInlineString = (dataSet, attr, options) => [decodeString(dataSet, attr, options)];

const getStrings = (dataSet, attr, options, decodeOptions) => {
  const ret = decodeString(dataSet, attr, options, decodeOptions);
  return ret ? ret.split('\\') : undefined;
};

const getValuePatientName = (dataSet, attr, options) => {
  const strings = getStrings(dataSet, attr, options, { delimiters: PN_DELIMITER_BYTES });
  return (strings && strings.map(item => ({ Alphabetic: item }))) || undefined;
};

/** Gets either InlineBinary or BulkDataURI, if already defined */
const getValueInlineBinary = (dataSet, attr) => {
  if (attr.BulkDataURI) return { BulkDataURI: attr.BulkDataURI };
  const binaryValue = dataSet.byteArray.slice(attr.dataOffset, attr.dataOffset + attr.length);
  return { InlineBinary: binaryValue.toString('base64') };
};

const getValueInlineSignedShort = (dataSet, attr) => {
  const ret = [];
  for (let i = 0; i < attr.length / 2; i++) {
    ret.push(dataSet.int16(attr.tag, i));
  }
  return ret;
};

const getValueInlineUnsignedShort = (dataSet, attr) => {
  const ret = [];
  for (let i = 0; i < attr.length / 2; i++) {
    ret.push(dataSet.uint16(attr.tag, i));
  }
  return ret;
};

const getValueInlineSignedLong = (dataSet, attr) => {
  if (attr.length > 4) {
    return getValueInlineBinary(dataSet, attr);
  }
  return [dataSet.int32(attr.tag)];
};

const getValueInlineUnsignedLong = (dataSet, attr) => {
  if (attr.length > 4) {
    return getValueInlineBinary(dataSet, attr);
  }
  return [dataSet.uint32(attr.tag)];
};

const getValueInlineFloat = (dataSet, attr) => {
  if (attr.length > 65536 * 4) {
    return getValueInlineBinary(dataSet, attr);
  }
  const ret = [];
  for (let i = 0; i < attr.length / 4; i++) {
    ret.push(dataSet.float(attr.tag, i));
  }
  return ret;
};

const getValueInlineIntString = (dataSet, attr) =>
  getStrings(dataSet, attr).map(val => parseInt(val));

const getValueInlineFloatString = (dataSet, attr) =>
  getStrings(dataSet, attr).map(val => parseFloat(val));

const getValueInlineFloatDouble = (dataSet, attr) => {
  if (attr.length > 8) {
    return getValueInlineBinary(dataSet, attr);
  }
  return [dataSet.double(attr.tag)];
};

const getValueInlineAttributeTag = (dataSet, attr) => {
  const group = dataSet.uint16(attr.tag, 0);
  const groupHexStr = `0000${group.toString(16)}`.substr(-4);
  const element = dataSet.uint16(attr.tag, 1);
  const elementHexStr = `0000${element.toString(16)}`.substr(-4);
  return groupHexStr + elementHexStr;
};

const getValueInline = (dataSet, attr, vr, options) => {
  if (attr.length == 0) {
    return [];
  }

  switch (vr) {
    case 'AE':
    case 'AS':
      return getValueInlineString(dataSet, attr, options);
    case 'AT':
      return getValueInlineAttributeTag(dataSet, attr);
    case 'DS':
      return getValueInlineFloatString(dataSet, attr);
    case 'CS':
    case 'DA':
    case 'DT':
      return getValueInlineString(dataSet, attr, options);
    case 'FL':
      return getValueInlineFloat(dataSet, attr);
    case 'FD':
      return getValueInlineFloatDouble(dataSet, attr);
    case 'IS':
      return getValueInlineIntString(dataSet, attr);
    case 'LO':
    case 'LT':
      return getValueInlineString(dataSet, attr, options);
    case 'OB':
    case 'OF':
    case 'OW':
      return getValueInlineBinary(dataSet, attr);
    case 'PN':
      return getValuePatientName(dataSet, attr, options);
    case 'SH':
      return getValueInlineString(dataSet, attr, options);
    case 'SL':
      return getValueInlineSignedLong(dataSet, attr);
    case 'SS':
      return getValueInlineSignedShort(dataSet, attr);
    case 'ST':
    case 'TM':
    case 'UI':
      return getValueInlineString(dataSet, attr, options);
    case 'UL':
      return getValueInlineUnsignedLong(dataSet, attr);
    case 'UN':
      return getValueInlineBinary(dataSet, attr);
    case 'US':
      return getValueInlineUnsignedShort(dataSet, attr);
    case 'UT':
      return getValueInlineString(dataSet, attr, options);
    default:
      return getValueInlineBinary(dataSet, attr);
  }
};

const isPrivate = attr => {
  const { tag } = attr;
  const ch = tag.substr(4, 1);
  const chHex = parseInt(ch, 16);
  return chHex % 2 == 1;
};

const RawEncapsulatedDocument = 'x00420011';

const isValueInline = (attr, options) => {
  if (isPrivate(attr)) {
    return attr.length <= options.maximumInlinePrivateLength;
  }
  // For encapsulated documents, almost always have them be external
  if (attr.tag === RawEncapsulatedDocument && attr.length > 4) {
    return false;
  }
  return !attr.length || attr.length <= options.maximumInlinePublicLength;
};

/**
 * Get data value for the given attr.
 * Attr can be a pixelData tag, sequence items, inline or bulkdata
 *
 * @param {*} dataSet
 * @param {*} attr
 * @param {*} vr
 * @param {*} getDataSet
 * @param {*} callback
 * @param {*} options object containing program properties.
 * @param {*} parentAttr attr's parent. If not present means attr is at root level.
 * @returns
 */
const getValue = async (dataSet, attr, vr, getDataSet, callback, options, parentAttr) => {
  // It will only process pixelData tag if on metadata root. Otherwise it will be skiped.
  if (attr.tag === 'x7fe00010' && !parentAttr) {
    const BulkDataURI = await extractImageFrames(dataSet, attr, vr, callback, options);
    return { BulkDataURI };
  }
  if (attr.tag === 'xfffee00d') return undefined;
  // Group length
  if (attr.tag.length == 9 && attr.tag.substring(5, 9) === '0000') return undefined;
  if (attr.items) {
    // sequences
    const result = [];
    for (const item of attr.items) {
      const subResult = await getDataSet(item.dataSet, callback, options, attr);
      if (subResult.metadata) result.push(subResult.metadata);
    }
    return result;
  }
  if (attr.Value) {
    return (Array.isArray(attr.Value) && attr.Value) || [attr.Value];
  }
  // non sequence item
  if (isValueInline(attr, options)) {
    return getValueInline(dataSet, attr, vr, options);
  }
  const binaryValue = dataSet.byteArray.slice(attr.dataOffset, attr.dataOffset + attr.length);
  const mimeType = attr.tag == 'x00420011' && dataSet.string('x00420012');

  const BulkDataURI = await callback.bulkdata(binaryValue, { mimeType });
  return { BulkDataURI, vr };
};
module.exports = getValue;
