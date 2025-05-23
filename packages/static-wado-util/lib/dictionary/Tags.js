const dcmjs = require("dcmjs");
const dataDictionary = require("./dataDictionary");

const { naturalizeDataset, denaturalizeDataset } =
  dcmjs.data.DicomMetaDictionary;

/** Find the actual tag for a private value */
const findPrivate = (item, tagObject, create) => {
  if (typeof tagObject === "string") return tagObject;
  if (typeof tagObject === "number")
    return `00000000${tagObject.toString(16)}`.slice(-8);
  const { creator, tag } = tagObject;
  if (!creator) return tag;
  const start = tag.substring(0, 4);
  const end = tag.substring(6, 8);
  // Should technically go all the way up, but for now only test 0x30 items
  let assignPosition;
  for (let offset = 0x10; offset < 0x40; offset++) {
    const testTag = `${start}00${offset.toString(16)}`;
    const testCreator = item[testTag];
    if (testCreator === undefined && assignPosition === undefined)
      assignPosition = offset;
    if (testCreator && testCreator.Value && testCreator.Value[0] === creator) {
      return `${start}${offset.toString(16)}${end}`;
    }
  }
  if (create) {
    if (!assignPosition)
      throw new Error(
        `Couldn't find any assign positions for ${creator} ${tag} in ${item}`
      );
    const creatorTag = `${start}00${assignPosition.toString(16)}`;
    item[creatorTag] = { Value: [creator], vr: "CS" };
    return `${start}${assignPosition.toString(16)}${end}`;
  }
};

const DeduppedCreator = "dedupped";

const Tags = {
  // Raw tags have the x before them, not parsed yet
  RawMinTag: "x00000000",
  RawFirstBodyTag: "x00080000",
  RawTransferSyntaxUID: "x00020010",
  RawSopInstanceUID: "x00080018",
  RawSpecificCharacterSet: "x00080005",
  RawSamplesPerPixel: "x00280002",
  RawPhotometricInterpretation: "x00280004",

  // This one isn't defined in the dataDictionary
  AvailableTransferSyntaxUID: "00083002",

  DeduppedCreator,

  // The references to extract data included in this object, 1..n values
  DeduppedRef: { creator: DeduppedCreator, tag: "00091010", vr: "LO" },

  // The hash value of THIS object
  DeduppedHash: { creator: DeduppedCreator, tag: "00091011", vr: "LO" },

  // Type of hash instance
  DeduppedType: { creator: DeduppedCreator, tag: "00091012", vr: "LO" },
  InstanceType: "instance",
  DeletedType: "deleted",
  InfoType: "info",

  naturalizeDataset,
  denaturalizeDataset,

  setValue: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    item[actualTag] = {
      Value: Array.isArray(value) ? value : [value],
      vr: dataDictionary[actualTag]?.vr || tag.vr || "UN",
    };
    return actualTag;
  },

  setList: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    item[actualTag] = {
      Value: Array.isArray(value) ? value : [value],
      vr: dataDictionary[actualTag]?.vr || tag.vr || "UN",
    };
    return actualTag;
  },

  pushList: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    if (!item[actualTag])
      item[actualTag] = {
        Value: [],
        vr: dataDictionary[actualTag]?.vr || tag.vr || "UN",
      };
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
      return value.length === 0 ? "" : value;
    }
    if (value.Value) {
      if (value.Value.length == 1) return value.Value[0];
      return value.Value.length === 0 ? "" : value.Value;
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
};

Object.keys(dataDictionary).forEach((key) => {
  const value = dataDictionary[key];
  Tags[value.name] = key;
});

module.exports = Tags;
