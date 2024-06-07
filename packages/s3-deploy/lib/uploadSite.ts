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
const uploadSite = function(site: Construct, name: string, cloudfrontOAI: cloudfront.OriginAccessIdentity, props: any) {
  console.log("props:", props);

  const { Bucket: dicomwebName } = props;

  const uploadBucket = getBucket(site, dicomwebName, props);
  new CfnOutput(site, 'Upload BucketURL', { value: uploadBucket.bucketWebsiteUrl});

  uploadBucket.addToResourcePolicy(new iam.PolicyStatement({
    actions: ['s3:GetObject'],
    resources: [uploadBucket.arnForObjects('*')],
    principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
  }));
  
  const responseHeadersPolicy = getResponseHeadersPolicy(site,name,props);

  return {
    origin: new cloudfront_origins.S3Origin(uploadBucket, {originAccessIdentity: cloudfrontOAI}),
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    responseHeadersPolicy,
  };
}

export default uploadSite;