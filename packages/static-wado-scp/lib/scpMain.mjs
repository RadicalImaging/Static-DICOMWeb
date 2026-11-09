import dcmjsDimse from 'dcmjs-dimse';
import StaticWado from '@radicalimaging/static-wado-creator';
import DcmjsDimseScp from './DcmjsDimseScp.mjs';

const { Server, Transcoding } = dcmjsDimse;
const { adaptProgramOpts } = StaticWado;

export default function scpMain(defaults) {
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
  // C-GET and C-MOVE transcode a stored compressed instance when the SCU accepts only another syntax
  return Transcoding.initializeAsync()
    .catch(e => console.log('Transcoding is not available:', e.message))
    .then(() => server.listen(port, options));
}
