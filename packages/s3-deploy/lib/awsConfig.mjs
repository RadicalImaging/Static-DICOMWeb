import ConfigPoint from 'config-point';
import { staticWadoConfig } from '@radicalimaging/static-wado-util';
import S3Ops from './S3Ops.mjs';

// Put the base configuration in staticWadoConfig so it can be over-ridden in site files
ConfigPoint.extendConfiguration('staticWadoConfig', {
  cloudfront: {},
  authentication: '~/aws-ohif.json',
  region: 'us-east-1',
});

const { awsConfig, awsHandlers } = ConfigPoint.register({
  awsConfig: {
    configBase: staticWadoConfig,

    helpShort: 'mkdicomwebdeploy',
    helpDescription: 'Make DICOMweb deployment to AWS',
  },

  awsHandlers: {
    dicomweb: S3Ops,
    client: S3Ops,
    curie: S3Ops,
    default: S3Ops,
  },
});

export default awsConfig;

export { awsConfig, awsHandlers };
