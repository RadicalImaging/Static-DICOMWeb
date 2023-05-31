import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

let responseHeadersPolicy;

const getResponseHeadersPolicy = (site: Construct, name: string, props: any) => {
  if (responseHeadersPolicy) return responseHeadersPolicy;
  console.log("Looking at name", name, props);
  console.log("Creating response headers policy", name, props);
  responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(site, 'shared-dicomweb-policy', {
    responseHeadersPolicyName: 'static-wado-policy',
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
  return responseHeadersPolicy;
}

export default getResponseHeadersPolicy;