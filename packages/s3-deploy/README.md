# AWS Deployment of Static DICOMweb

The s3-deploy project provides scripts to provision/deploy and configure one or more Static DICOMweb sites to AWS.  This uses a CloudFront distribution front-end, with data stored in an S3 bucket.  There are a variety of
access control mechanisms.

The package also includes the basic file store/retrieve operations to allow storing data to and from the S3 storage.  See [Storing and Retrieving to the Cloud](../static-wado-deploy/README.md).


 
## AWS Setup
If you are going to be deploying to AWS, you need to do these common steps, as described in AWS guides:

1. Issue yourself a set of of AWS programmatic access keys for an admin level AWS account
2. Create an AWS programmatic access account permitted to read/write the S3 data.  Make these your default keys.
3. Download and install the AWS CLI and AWS CDK
4. Store your AWS keys into the `~/.aws/credentials`
5. Initialize CDK in the s3-deploy subdirectory using `cdk bootstrap` command
6. Create a configuration storing your AWS storage (see below)
7. From the s3-deploy sub-directory, run `yarn deploy <deploymentName>`

Note: NEVER store you aws keys in a public place, these give unfettered access to your account.

## Configuration For AWS
The tool looks for a JSON5 configuration file (which is JSON + comments basically), located either in  `./static-wado.json5` or else in `~/static-wado.json5`.
There are example configuration files for generating [one](./static-wado.json5.sample) or [more](./static-wado.json5.multidist.sample) AWS CloudFront distributions.

An example of a distribution configuration is here:
```javascript
{
  staticWadoConfig: {
    deployments: [
      {
        name: 'ohif-with-dicomweb',
        clientDir: '~/ohif',
        rootDir: '~/dicomweb',
        region: 'us-east-1',
        clientGroup: {
          Bucket: 'your-bucket-name',
        },
        rootGroup: {
          path: "/dicomweb",
          Bucket: 'your-dicomweb-bucket-name',
          useExistingBucket: false,
          index: 'your-dicomweb-index.json.gz',
        },
      },
    ],
    s3Env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  },
}
```

### deployments section
The deployments section of the static wado config is a list of named deployments.  They can be created separately or together.  The configuration fields are:

* name - The name of this deployment, used to choose which deployment to create or upload/download from
* clientDir - the default directory of the Web App used for this deployment
* rootDir - the DICOMweb file root used for this back end.  Can be shared with multiple deployments.
* region - the AWS region to deploy teh cloudfront to
* clientGroup - the set of settings used for the WebApp
  * Bucket - the bucket used to store the WebApp
  * useExistingBucket - set to true to an existing, named bucket
* rootGroup - the setting used for the DICOMweb server
  * Bucket - the bucket name used for storing DICOMweb files
  * useExistingBucket - set to true to connect to an existing, named bucket
  * path - is the path to serve files with for this bucket
  * index - is a a LOCAL file name used to update the remote studies index when adding new studies (or deleting)

### s3Env
The s3 env contains the information on the account to store to/from, and the default region.

### Multiple Groups, Advanced Options
It is possible to create/define additional S3 buckets on different paths, used for various types of uploads.  
TODO - find an example of how to do this

## Deploying to the Cloud
Use your admin level AWS programmatic access keys for deploying or updating a Static DICOMweb cloud deployment.

To synthesize the CloudFormation template for use in deploying AWS resources:
```
yarn synth
```

To deploy the CloudFormation template (and synthesize if necessary):
```
yarn deploy {deployment-name}
```
