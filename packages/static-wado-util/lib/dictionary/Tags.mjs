import dcmjs from 'dcmjs';
import dataDictionary from './dataDictionary.js';

const { naturalizeDataset, denaturalizeDataset } = dcmjs.data.DicomMetaDictionary;

/*
 * Private blocks in DICOM JSON (PS3.5 7.8.1), with the rules of the dcmjs 1.0
 * naturalized form (privateBlocks.js): a block is found by its group and
 * creator, never by a fixed tag. A new block takes the preferred xx when that
 * xx is free, and the first free xx from 0x10 to 0xFF otherwise.
 */
const PRIVATE_TAG = /^[0-9A-F]{3}[13579BDF][0-9A-F]{4}$/i;
const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');

/** The creator string of a private creator element, without the LO padding. */
const creatorText = element => String(element?.Value?.[0] ?? '').replace(/^ +|[\0 ]+$/g, '');

// Older data has a lowercase xx (for example "0009001a")
const creatorElement = (item, group, xx) =>
  item[`${group}00${hex2(xx)}`] ?? item[`${group}00${hex2(xx).toLowerCase()}`];

/** The xx of the block of `creator` in `group`, or undefined. */
const findPrivateBlock = (item, group, creator) => {
  for (let xx = 0x10; xx <= 0xff; xx++) {
    if (creatorText(creatorElement(item, group, xx)) === creator) return xx;
  }
  return undefined;
};

/** The xx of the block of `creator` in `group`; reserves a block when there is none. */
const reservePrivateBlock = (item, group, creator, preferred = 0x10) => {
  const found = findPrivateBlock(item, group, creator);
  if (found !== undefined) return found;
  const free = xx => creatorElement(item, group, xx) === undefined;
  let xx = preferred >= 0x10 && free(preferred) ? preferred : undefined;
  for (let n = 0x10; xx === undefined && n <= 0xff; n++) if (free(n)) xx = n;
  if (xx === undefined) throw new Error(`No free private block in group ${group} for ${creator}`);
  item[`${group}00${hex2(xx)}`] = { vr: 'LO', Value: [creator] };
  return xx;
};

/** Removes the block of `creator` in `group`: the creator element and its elements. */
const removePrivateBlock = (item, group, creator) => {
  const xx = findPrivateBlock(item, group, creator);
  if (xx === undefined) return false;
  const prefix = `${group}${hex2(xx)}`.toUpperCase();
  for (const key of Object.keys(item)) {
    if (key.toUpperCase().startsWith(prefix)) delete item[key];
  }
  delete item[`${group}00${hex2(xx)}`];
  delete item[`${group}00${hex2(xx).toLowerCase()}`];
  return true;
};

/**
 * Copies each element of `source` that `target` does not have. A private
 * element goes into the block of its creator in `target`, so the blocks of
 * two items merge by creator, not by tag. The blocks of `skipCreators` are
 * not copied.
 */
const assignUndefined = (target, source, skipCreators = []) => {
  if (!source) return target;
  const blocks = new Map();
  for (const key of Object.keys(source)) {
    if (!PRIVATE_TAG.test(key)) continue;
    const element = parseInt(key.slice(4), 16);
    if (element < 0x10 || element > 0xff) continue;
    const creator = creatorText(source[key]);
    if (creator && !skipCreators.includes(creator)) {
      blocks.set(`${key.slice(0, 4)}${hex2(element)}`.toUpperCase(), creator);
    }
  }
  for (const key of Object.keys(source)) {
    if (!PRIVATE_TAG.test(key)) {
      if (!target[key]) target[key] = source[key];
      continue;
    }
    const group = key.slice(0, 4);
    const element = parseInt(key.slice(4), 16);
    if (element <= 0xff) continue; // a creator: copied with its block
    const xx = element >> 8;
    const creator = blocks.get(`${group}${hex2(xx)}`.toUpperCase());
    if (creator === undefined) {
      // an element of a skipped block, or an element with no creator
      if (creatorElement(source, group, xx) === undefined && !target[key]) {
        target[key] = source[key];
      }
      continue;
    }
    const targetXx = reservePrivateBlock(target, group, creator, xx);
    const targetKey = `${group}${hex2(targetXx)}${key.slice(6, 8)}`.toUpperCase();
    if (!target[targetKey]) target[targetKey] = source[key];
  }
  return target;
};

/** Find the actual tag for a private value */
const findPrivate = (item, tagObject, create) => {
  if (typeof tagObject === 'string') return tagObject;
  if (typeof tagObject === 'number') return `00000000${tagObject.toString(16)}`.slice(-8);
  const { creator, tag } = tagObject;
  if (!creator) return tag;
  const group = tag.substring(0, 4);
  const xx = create
    ? reservePrivateBlock(item, group, creator)
    : findPrivateBlock(item, group, creator);
  if (xx === undefined) return undefined;
  const actual = `${group}${hex2(xx)}${tag.substring(6, 8)}`;
  // Older data has a lowercase xx
  return item[actual] === undefined && item[actual.toLowerCase()] !== undefined
    ? actual.toLowerCase()
    : actual;
};

const DeduppedCreator = 'dedupped';

export const Tags = {
  // Raw tags have the x before them, not parsed yet
  RawMinTag: 'x00000000',
  RawFirstBodyTag: 'x00080000',
  RawTransferSyntaxUID: 'x00020010',
  RawSopInstanceUID: 'x00080018',
  RawSpecificCharacterSet: 'x00080005',
  RawSamplesPerPixel: 'x00280002',
  RawPhotometricInterpretation: 'x00280004',

  // This one isn't defined in the dataDictionary
  AvailableTransferSyntaxUID: '00083002',

  DeduppedCreator,

  // The references to extract data included in this object, 1..n values
  DeduppedRef: { creator: DeduppedCreator, tag: '00091010', vr: 'LO' },

  // The hash value of THIS object
  DeduppedHash: { creator: DeduppedCreator, tag: '00091011', vr: 'LO' },

  // Type of hash instance
  DeduppedType: { creator: DeduppedCreator, tag: '00091012', vr: 'LO' },
  InstanceType: 'instance',
  DeletedType: 'deleted',
  InfoType: 'info',

  naturalizeDataset,
  denaturalizeDataset,

  setValue: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    item[actualTag] = {
      Value: Array.isArray(value) ? value : [value],
      vr: dataDictionary[actualTag]?.vr || tag.vr || 'UN',
    };
    return actualTag;
  },

  setList: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    item[actualTag] = {
      Value: Array.isArray(value) ? value : [value],
      vr: dataDictionary[actualTag]?.vr || tag.vr || 'UN',
    };
    return actualTag;
  },

  pushList: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    if (!item[actualTag])
      item[actualTag] = {
        Value: [],
        vr: dataDictionary[actualTag]?.vr || tag.vr || 'UN',
      };
    // An empty element in DICOM JSON has no Value
    item[actualTag].Value ||= [];
    item[actualTag].Value.push(value);
    return actualTag;
  },

  getValue: (item, tag) => {
    const actualTag = findPrivate(item, tag);
    if (!actualTag) return undefined;
    const value = item[actualTag];
    if (value === undefined) return undefined;
    if (Array.isArray(value)) {
      if (value.length == 1) return value[0];
      return value.length === 0 ? '' : value;
    }
    if (value.Value) {
      if (value.Value.length == 1) return value.Value[0];
      return value.Value.length === 0 ? '' : value.Value;
    }
    return value;
  },

  getList: (item, tag) => {
    const actualTag = findPrivate(item, tag);
    if (!actualTag) return undefined;
    const value = item[actualTag];
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return value;
    if (value.Value) return value.Value;
    return [value];
  },

  removeValue: (item, tag) => {
    const actualTag = findPrivate(item, tag);
    if (actualTag) delete item[actualTag];
    // TODO, remove creator tag if not used any longer
  },

  findPrivate,
  findPrivateBlock,
  reservePrivateBlock,
  removePrivateBlock,
  assignUndefined,
};

Object.keys(dataDictionary).forEach(key => {
  const value = dataDictionary[key];
  Tags[value.name] = key;
});

export default Tags;
