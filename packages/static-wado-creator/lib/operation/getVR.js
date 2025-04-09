const { dataDictionary } = require("@radicalimaging/static-wado-util");

const nullVrTags = new Set();
nullVrTags.add("FFFEE00D");

const getVR = (attr) => {
  if (attr.vr) {
    return attr.vr;
  }
  // lookup the vr using the data dictionary
  const tag = attr.tag.substring(1).toUpperCase();
  const dataDictAttr = dataDictionary[tag];
  if (dataDictAttr?.vr) {
    return dataDictAttr.vr;
  }
  if (nullVrTags.has(tag)) {
    return null;
  }

  console.log("Unknown VR", tag, attr, dataDictAttr);
  return "UN";
};

module.exports = getVR;
