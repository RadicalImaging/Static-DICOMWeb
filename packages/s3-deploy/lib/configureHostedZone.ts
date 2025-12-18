#!/usr/bin/env node
import { DnsValidatedCertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, HostedZone, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IDistribution } from 'aws-cdk-lib/aws-cloudfront';

/**
 * Configures certificate for HostedZone with custom domain name.
 */
const getSiteInfo = function (site: Construct, name: string, props: any) {
  if (!props.domainName) {
    return undefined;
  }

  const siteSubDomain = props.siteSubDomain || 'www';
  const zone = HostedZone.fromLookup(site, `${name}-zone`, { domainName: props.domainName });
  const siteDomain = siteSubDomain + '.' + props.domainName;

  // TLS certificate
  const certificate = new DnsValidatedCertificate(site, `${name}-cert`, {
    domainName: siteDomain,
    hostedZone: zone,
    region: 'us-east-1', // Cloudfront only checks this region for certificates.
  });
  new CfnOutput(site, 'Certificate', { value: certificate.certificateArn });

  return {
    siteDomain: siteDomain,
    certificate: certificate,
    zone: zone,
  };
};

const configureDomain = function (
  site: Construct,
  name: string,
  siteDomain: string,
  zone: IHostedZone,
  distribution: IDistribution
) {
  // Route53 alias record for the CloudFront distribution
  new ARecord(site, `${name}-arec`, {
    recordName: siteDomain,
    target: RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    zone,
  });
};

export { configureDomain, getSiteInfo };
