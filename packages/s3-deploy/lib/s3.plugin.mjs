import ConfigPoint from 'config-point';
import S3Ops from './S3Ops.mjs';

const s3Plugin = ConfigPoint.createConfiguration('s3Plugin', {
  createPlugin: S3Ops,
});

export default s3Plugin;
