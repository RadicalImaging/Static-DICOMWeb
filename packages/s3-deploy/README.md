# `@radicalimaging/s3-deploy`

The s3-deploy project provides a utility to provision and configure one or more static AWS S3 sites with CloudFront distribution front-ends.


## Pre-requisites
View root pre-requisites section [pre-requisites](../../README.md#pre-requisites)

aws env configuration is specified in static-wado.json5 - @see {@link https://docs.aws.amazon.com/cdk/latest/guide/environments.html}

## Development
View root development section [development](../../README.md#development).

## Configuration
The tool looks for a JSON5 configuration file (which is JSON + comments basically), located either in  `./static-wado.json5` or else in `~/static-wado.json5`.
There are example configuration files for generating [one](./static-wado.json5.sample) or [more](./static-wado.json5.multidist.sample) AWS CloudFront distributions.

## Usage
To synthesize the CloudFormation template for use in deploying AWS resources:
```
yarn synth
```

To deploy the CloudFormation template (and synthesize if necessary):
```
yarn deploy
```
if multiple deployments are configured:
```
yarn deploy {deployment-name}
```
or
```
yarn deploy --all
```

### Providing a domain name
By default, the CloudFront distribution will have an AWS CloudFront URL like https://d1pokyc8m99gjv.cloudfront.net. To use the s3-deploy tool to link to an existing domain when creating the CloudFront distribution(s), the following conditions must be met:
- the domain name must be under control of the user
- the domain must support DNS validation - @see {@link https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html}
- there must be an existing hosted zone in AWS Route 53 @see {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/AboutHZWorkingWith.html}

The [multi-distribution example](./static-wado.json5.multidist.sample) includes a distribution which specifies such a configuration, based upon the domainName and siteSubDomain attributes. When these attributes are present for a distribution, s3-deploy will:
1. Look up the hosted zone specified by domain name 
2. Request a certificate through AWS for the specified siteSubDomain + domainName (ohif.example.dev) in the example configuration.

The certificate request may time out, even when the domain is provided by AWS. Often a subsequent run of yarn deploy will succeed, but it is also possible to configure this manually afterwards using https://us-east-1.console.aws.amazon.com/acm/home and https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones
