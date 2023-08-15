const dcmjsDimse = require("dcmjs-dimse");

const { Server } = dcmjsDimse;
const { adaptProgramOpts } = require("@radicalimaging/static-wado-creator");
const DcmjsDimseScp = require("./DcmjsDimseScp");

/**
 * 
 */
module.exports = function cstoreMain(destinationAe, studies, defaults) {
  console.log("cstoreMain", destinationAe, studies);
  const options = adaptProgramOpts(defaults, {
    ...this,
    isInstance: false,
    isGroup: true,
    isDeduplicate: true,
    isStudyData: true,
  });

  
};
