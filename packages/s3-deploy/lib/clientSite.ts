#!/usr/bin/env node
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Function, FunctionCode, FunctionEventType } from 'aws-cdk-lib/aws-cloudfront';
import getBucket from './getBucket.js';

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
const clientSite = function(site: Construct, name: string, cloudfrontOAI: cloudfront.OriginAccessIdentity, props: any){
  console.log("props:", props);

  const { Bucket: ohifName } = props;
  
  // Content bucket
  const ohifBucket = getBucket(site, ohifName, props);;
  new CfnOutput(site, 'OHIF BucketURL', { value: ohifBucket.bucketWebsiteUrl});

  // Grant access to cloudfront
  ohifBucket.addToResourcePolicy(new iam.PolicyStatement({
    actions: ['s3:GetObject'],
    resources: [ohifBucket.arnForObjects('*')],
    principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
  }));
  
  const ohifResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(site, `${name}-ohif-response-policy`, {
    responseHeadersPolicyName: `${name}-ohif-rhp`,
    comment: 'Cors headers for viewer',
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

  const rewriteFunction = new Function(site, `${name}-rf`, {
    code: FunctionCode.fromInline(`
      function handler(event) {
        var request = event.request;
    
        if (!request.uri.includes('.')) {
            request.uri = '/index.html';
        } 
    
        return request;
      }`
    )});

  return {
    origin: new cloudfront_origins.S3Origin(ohifBucket, {originAccessIdentity: cloudfrontOAI}),
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    responseHeadersPolicy: ohifResponseHeadersPolicy,
    functionAssociations: [{
      function: rewriteFunction,
      eventType: FunctionEventType.VIEWER_REQUEST,
    }],
  };
}

export default clientSite;