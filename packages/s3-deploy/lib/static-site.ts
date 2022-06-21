#!/usr/bin/env node
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { handleHomeRelative, configGroup } from '@radical/static-wado-util';
import clientSite from './clientSite.js';
import rootSite from './rootSite.js';

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class StaticSite extends Construct {
  constructor(parent: Stack, name: string, props: any) {
    super(parent, name);

    console.log("props:", props);
    if ( !props.clientGroup && !props.rootGroup ) {
      throw new Error("No clientGroup or rootGroup declared in deployment");
    }

    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, `${name}-OAI`, {
      comment: `OAI for ${name}`
    });

    let clientDistProps;
    if (props.clientGroup) {
      const clientGroup = configGroup(props,"client");
      console.log("clientGroup:", clientGroup);
      clientDistProps = clientSite(this,name,cloudfrontOAI,clientGroup);
    } else {
      console.log("no clientGroup specified for deployment:", name);
    }
  
    let rootDistProps;
    if (props.rootGroup) {
      const rootGroup = configGroup(props,"root");
      console.log("rootGroup:", rootGroup);
      rootDistProps = rootSite(this,name,cloudfrontOAI,rootGroup);
    } else {
      console.log("no rootGroup specified for deployment:", name);
    }

    const defaultDistProps = clientDistProps || rootDistProps;
    const additionalDistProps = (clientDistProps && rootDistProps) ? { "/dicomweb/*": rootDistProps } : undefined;

    // const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName });
    // const siteDomain = props.siteSubDomain + '.' + props.domainName;
    
    // TLS certificate
    // const certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
    //   domainName: siteDomain,
    //   hostedZone: zone,
    //   region: 'us-east-1', // Cloudfront only checks this region for certificates.
    // });
    // new CfnOutput(this, 'Certificate', { value: certificate.certificateArn });



    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, `${name}`, {
      // certificate: certificate,
      // domainNames: [siteDomain],
      enableIpv6: true,
      defaultBehavior: defaultDistProps,
      additionalBehaviors: additionalDistProps,
    });

  
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'DistributionDomainName', { value: distribution.distributionDomainName} );
    // // Route53 alias record for the CloudFront distribution
    // new route53.ARecord(this, 'SiteAliasRecord', {
    //   recordName: siteDomain,
    //   target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    //   zone
    // });

    
    // Deploy site contents to S3 bucket
    const clientDir = handleHomeRelative(props.clientDir || './site-contents');
    new CfnOutput(this, 'clientDir', { value: clientDir } );
  }
}
