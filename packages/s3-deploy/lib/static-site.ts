#!/usr/bin/env node
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { handleHomeRelative, configGroup } from '@radicalimaging/static-wado-util';
import clientSite from './clientSite.js';
import rootSite from './rootSite.js';
import uploadSite from './uploadSite.js';
import { getSiteInfo, configureDomain } from './configureHostedZone.js';
import createDocumentGroup from './createDocumentDb.js';

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class StaticSite extends Construct {
  constructor(parent: Stack, name: string, props: any) {
    super(parent, name);

    if (!props.clientGroup && !props.rootGroup) {
      throw new Error('No clientGroup or rootGroup declared in deployment');
    }

    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, `${name}-OAI`, {
      comment: `OAI for ${name}`,
    });
    console.warn('******** cloadfrontOAI', name, cloudfrontOAI);

    const distProps = new Map();
    let defaultDistribution;

    if (props.rootGroup) {
      const rootGroup = configGroup(props, 'root');
      distProps.set('/dicomweb/*', rootSite(this, name, cloudfrontOAI, rootGroup));
      defaultDistribution = '/dicomweb/*';
    } else {
      console.log('no rootGroup specified for deployment:', name);
    }

    if (props.uploadGroup) {
      const group = configGroup(props, 'upload');
      console.log('Upload Group:', group);
      distProps.set('/lei/*', uploadSite(this, name, cloudfrontOAI, group));
      defaultDistribution = '/lei/*';
    } else {
      console.log('no extra group specified for deployment:', name);
    }

    if (props.indexGroup) {
      const group = configGroup(props, 'index');
      console.log('Index group', group);
      createDocumentGroup(this, group);
    }

    if (props.clientGroup) {
      const clientGroup = configGroup(props, 'client');
      console.log('clientGroup:', clientGroup);
      distProps.set('/', clientSite(this, name, cloudfrontOAI, clientGroup));
      defaultDistribution = '/';
    } else {
      console.log('no clientGroup specified for deployment:', name);
    }

    // Split the distribution properties into the primary one (first added), and everything else
    const defaultDistProps = distProps.get(defaultDistribution);
    distProps.delete(defaultDistribution);
    const distIterator = distProps.entries();
    const additionalDistProps = distProps.size ? Object.fromEntries(distIterator) : undefined;

    const siteInfo = getSiteInfo(this, name, props);
    const siteDomain = siteInfo ? [siteInfo.siteDomain] : undefined;

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, `${name}`, {
      certificate: siteInfo?.certificate,
      domainNames: siteDomain,
      enableIpv6: true,
      defaultBehavior: defaultDistProps,
      additionalBehaviors: additionalDistProps,
      httpVersion: cloudfront.HttpVersion.HTTP3,
    });

    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

    if (siteInfo) {
      configureDomain(this, name, siteInfo.siteDomain, siteInfo.zone, distribution);
    }
    new CfnOutput(this, 'DistributionDomainName', {
      value: siteInfo ? siteInfo.siteDomain : distribution.distributionDomainName,
    });

    // Deploy site contents to S3 bucket
    const clientDir = handleHomeRelative(props.clientDir || './site-contents');
    new CfnOutput(this, 'clientDir', { value: clientDir });
  }
}
