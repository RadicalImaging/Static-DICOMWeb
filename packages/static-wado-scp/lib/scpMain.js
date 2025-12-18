const dcmjsDimse = require('dcmjs-dimse');

const { Server } = dcmjsDimse;
const { adaptProgramOpts } = require('@radicalimaging/static-wado-creator');
const DcmjsDimseScp = require('./DcmjsDimseScp');

module.exports = function scpMain(defaults) {
  const options = adaptProgramOpts(defaults, {
    ...this,
    isInstance: false,
    isGroup: true,
    isDeduplicate: true,
    isStudyData: true,
  });

  const port = options.scpPort || 11112;

  const server = new Server(DcmjsDimseScp);
  server.on('networkError', e => {
    console.log('Network error: ', e);
  });
  console.log('Starting server listen on port', port);
  DcmjsDimseScp.setParams(options);
  server.listen(port, options);
};
