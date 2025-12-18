#!/usr/bin/env node
import * as s3 from 'aws-cdk-lib/aws-s3';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';

const cors = [
  {
    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
    allowedOrigins: ['*'],
    allowedHeaders: ['*'],
  },
];

/**
 * Constructs or gets an existing S3 bucket definition for use by distribution.
 */
const getBucket = function (site: Construct, name: string, props: any) {
  const { useExistingBucket = false } = props;

  return useExistingBucket
    ? s3.Bucket.fromBucketName(site, name, name)
    : new s3.Bucket(site, name, {
        bucketName: name,
        cors,
        blockPublicAccess: {
          ignorePublicAcls: false,
          blockPublicAcls: false,
          restrictPublicBuckets: false,
          blockPublicPolicy: false,
        },
        removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
        autoDeleteObjects: true, // NOT recommended for production code
      });
};

export default getBucket;
