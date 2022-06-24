#!/usr/bin/env node
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import getBucket from './getBucket.js';

/**
 * Constructs an S3 bucket definition for dicomweb data, for use by distribution.
 */
const rootSite = function(site: Construct, name: string, cloudfrontOAI: cloudfront.OriginAccessIdentity, props: any) {
  console.log("props:", props);

  const { Bucket: dicomwebName } = props;

  const dicomwebBucket = getBucket(site, dicomwebName, props);
  new CfnOutput(site, 'DICOMweb BucketURL', { value: dicomwebBucket.bucketWebsiteUrl});

  dicomwebBucket.addToResourcePolicy(new iam.PolicyStatement({
    actions: ['s3:GetObject'],
    resources: [dicomwebBucket.arnForObjects('*')],
    principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
  }));
  
  const dicomwebResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(site, `${name}-DICOMweb-response-policy`, {
    responseHeadersPolicyName: `${name}-dw-rhp`,
    comment: 'Allow prefetch for DICOMweb with authorization and quotes in content-type',
    corsBehavior: {
      accessControlAllowCredentials: false,
      accessControlAllowHeaders: ['*'],
      accessControlAllowMethods: ['GET', 'OPTIONS', 'HEAD'],
      accessControlAllowOrigins: ['*'],
      originOverride: true,
    },
    customHeadersBehavior: {
      customHeaders: [
        { header: 'Cross-Origin-Embedder-Policy', value: 'require-corp', override: true },
        { header: 'Cross-Origin-Opener-Policy', value: 'same-origin', override: true },
      ],
    },
    securityHeadersBehavior: {
      // contentSecurityPolicy: { contentSecurityPolicy: "script-src: unsafe-eval", override: true },
      contentTypeOptions: { override: true },
    },
  });

  return {
    origin: new cloudfront_origins.S3Origin(dicomwebBucket, {originAccessIdentity: cloudfrontOAI}),
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    responseHeadersPolicy: dicomwebResponseHeadersPolicy,
  };
}

export default rootSite;