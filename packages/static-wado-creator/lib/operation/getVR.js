const { dataDictionary } = require("@radicalimaging/static-wado-util");

const getVR = (attr) => {
  if (attr.vr) {
    return attr.vr;
  }
  // lookup the vr using the data dictionary
  const tag = attr.tag.substring(1).toUpperCase();
  const dataDictAttr = dataDictionary[tag];
  if (dataDictAttr) {
    return dataDictAttr.vr;
  }
  return undefined;
};

module.exports = getVR;
