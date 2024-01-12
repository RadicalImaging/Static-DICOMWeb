import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

let responseHeadersPolicy;
const responseHeadersId = 'shared-dicomweb-policy';
const responseHeadersName = 'static-wado-policy';
const id = 'bb3e37b2-0b13-40eb-afb3-6072919a6c42';

const getResponseHeadersPolicy = (site: Construct, name: string, props: any) => {
  if (responseHeadersPolicy) return responseHeadersPolicy;
  console.log("Creating response headers policy", name, props);
  try {
    // responseHeadersPolicy = cloudfront.ResponseHeadersPolicy.fromResponseHeadersPolicyId(site, responseHeadersName, responseHeadersName);
    // responseHeadersPolicy = cloudfront.ResponseHeadersPolicy.fromResponseHeadersPolicyId(site, responseHeadersId, responseHeadersName);
    // responseHeadersPolicy = cloudfront.ResponseHeadersPolicy.fromResponseHeadersPolicyId(site, id, responseHeadersId);
    responseHeadersPolicy = cloudfront.ResponseHeadersPolicy.fromResponseHeadersPolicyId(site, responseHeadersId, id);
  } catch(e) {
    console.log("Couldn't find response headers policy, creating");
  }
  if( responseHeadersPolicy ) {
    return responseHeadersPolicy;
  }
  responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(site, responseHeadersId, {
    responseHeadersPolicyName: responseHeadersName,
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