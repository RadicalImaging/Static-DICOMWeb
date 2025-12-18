#!/usr/bin/env node
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import getBucket from './getBucket.js';
import getResponseHeadersPolicy from './getResponseHeadersPolicy.js';

/**
 * Constructs an S3 bucket definition for dicomweb data, for use by distribution.
 */
const rootSite = function (
  site: Construct,
  name: string,
  cloudfrontOAI: cloudfront.OriginAccessIdentity,
  props: any
) {
  const { Bucket: dicomwebName } = props;

  const dicomwebBucket = getBucket(site, dicomwebName, props);
  new CfnOutput(site, 'DICOMweb BucketURL', { value: dicomwebBucket.bucketWebsiteUrl });

  dicomwebBucket.addToResourcePolicy(
    new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [dicomwebBucket.arnForObjects('*')],
      principals: [
        new iam.CanonicalUserPrincipal(
          cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId
        ),
      ],
    })
  );

  const responseHeadersPolicy = getResponseHeadersPolicy(site, name, props);

  return {
    origin: new cloudfront_origins.S3Origin(dicomwebBucket, {
      originAccessIdentity: cloudfrontOAI,
    }),
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    responseHeadersPolicy,
  };
};

export default rootSite;
