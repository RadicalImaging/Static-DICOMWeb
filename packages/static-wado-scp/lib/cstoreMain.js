const { adaptProgramOpts } = require('@radicalimaging/static-wado-creator');

/**
 *
 */
module.exports = function cstoreMain(destinationAe, studies, defaults) {
  const options = adaptProgramOpts(defaults, {
    ...this,
    isInstance: false,
    isGroup: true,
    isDeduplicate: true,
    isStudyData: true,
  });
  console.log('cstoreMain', destinationAe, studies, options);
};
