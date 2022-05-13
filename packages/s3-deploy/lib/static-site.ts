#!/usr/bin/env node
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { handleHomeRelative, configGroup } from '@ohif/static-wado-util';

const cors = [
  {
    allowedMethods: [
      s3.HttpMethods.GET,
      s3.HttpMethods.HEAD,
    ],
    allowedOrigins: ['*'],
    allowedHeaders: ['*'],
  },
]

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class StaticSite extends Construct {
  constructor(parent: Stack, name: string, props: any) {
    super(parent, name);
    const clientGroup = configGroup(props,"client");
    const rootGroup = configGroup(props,"root");

    const { Bucket: ohifName } = clientGroup;
    const { Bucket: dicomwebName } = rootGroup;

    // const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName });
    // const siteDomain = props.siteSubDomain + '.' + props.domainName;
    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'cloudfront-OAI', {
      comment: `OAI for ${name}`
    });

    // new CfnOutput(this, 'Site', { value: 'https://' + siteDomain });

    // Content bucket
    const ohifBucket = new s3.Bucket(this, ohifName, {
      bucketName: ohifName,
      cors,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
      autoDeleteObjects: true, // NOT recommended for production code
    });
    new CfnOutput(this, 'OHIF BucketURL', { value: ohifBucket.bucketWebsiteUrl});

    const dicomwebBucket = new s3.Bucket(this, dicomwebName, {
      bucketName: dicomwebName,
      cors,
      websiteIndexDocument: 'index.json',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
      autoDeleteObjects: true, // NOT recommended for production code
    });
    new CfnOutput(this, 'DICOMweb BucketURL', { value: dicomwebBucket.bucketWebsiteUrl});

    // Grant access to cloudfront
    ohifBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [ohifBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
    }));
    
    dicomwebBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [dicomwebBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
    }));
    
    // TLS certificate
    // const certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
    //   domainName: siteDomain,
    //   hostedZone: zone,
    //   region: 'us-east-1', // Cloudfront only checks this region for certificates.
    // });
    // new CfnOutput(this, 'Certificate', { value: certificate.certificateArn });

    const myResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
      responseHeadersPolicyName: 'AllowDICOMwebRequests',
      comment: 'Allow prefetch for DICOMweb with authorization and quotes in content-type',
      corsBehavior: {
        accessControlAllowCredentials: false,
        accessControlAllowHeaders: ['*'],
        accessControlAllowMethods: ['GET', 'OPTIONS', 'HEAD'],
        accessControlAllowOrigins: ['*'],
        originOverride: true,
      },
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: "script-src: 'unsafe-eval';", override: true },
        contentTypeOptions: { override: true },
      },
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'StaticDICOMWeb', {
      // certificate: certificate,
      // domainNames: [siteDomain],
      enableIpv6: true,
      defaultBehavior: {
        origin: new cloudfront_origins.S3Origin(ohifBucket, {originAccessIdentity: cloudfrontOAI}),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        responseHeadersPolicy: myResponseHeadersPolicy,
      },
      additionalBehaviors: {
        "/dicomweb/*": {
          origin: new cloudfront_origins.S3Origin(dicomwebBucket, {originAccessIdentity: cloudfrontOAI}),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          responseHeadersPolicy: myResponseHeadersPolicy,
        },
      },
    })

  
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName} );
    // // Route53 alias record for the CloudFront distribution
    // new route53.ARecord(this, 'SiteAliasRecord', {
    //   recordName: siteDomain,
    //   target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    //   zone
    // });

    
    // Deploy site contents to S3 bucket
    const clientDir = handleHomeRelative(clientGroup.dir || './site-contents');
    new CfnOutput(this, 'clientDir', { value: clientDir } );
  }
}
