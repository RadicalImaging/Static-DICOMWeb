import dcmjsDimse from 'dcmjs-dimse';
import StaticWado from '@radicalimaging/static-wado-creator';
import { aeConfig } from '@radicalimaging/static-wado-util';
import DcmjsDimseScp from './DcmjsDimseScp.mjs';
import { removeStaleRetrieveDirs } from './retrieve.mjs';

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
  // -a NAME@host:port adds a C-MOVE destination
  for (const ae of [options.ae].flat().filter(Boolean)) {
    const match = /^([^@]+)@(.+):(\d+)$/.exec(ae);
    if (match) aeConfig[match[1]] = { host: match[2], port: Number(match[3]) };
    else console.warn('Ignored -a', ae, '- use NAME@host:port');
  }

  const server = new Server(DcmjsDimseScp);
  server.on('networkError', e => {
    console.log('Network error: ', e);
  });
  console.log('Starting server listen on port', port);
  DcmjsDimseScp.setParams(options);
  removeStaleRetrieveDirs();
  // C-GET and C-MOVE transcode a stored compressed instance when the SCU accepts only another syntax
  return Transcoding.initializeAsync()
    .catch(e => console.log('Transcoding is not available:', e.message))
    .then(() => server.listen(port, options));
}
