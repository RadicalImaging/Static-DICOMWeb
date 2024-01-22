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
  * index - is a a LOCAL file name used to update the remote studies index when adding new studies (or deleting) (will be created as required)

### s3Env
The s3 env contains the information on the account to store to/from, and the default region.

### Multiple Groups, Advanced Options
It is possible to create/define additional S3 buckets on different paths, used for various types of uploads.  
Simply add additional groups modelled after the `root` group, for example:

```javascript
part10Group: {
  // Set to the path it maps to
  path: "/part10",
  // Set to true to share a bucket with another deployment, or false to create it here
  useExistingBucket: false,
  Bucket: 'dicomweb-part10-bucket',
},
```

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

**Follow the instructions to setup access permissions for cloudfront to s3**

**Optionally setup user access control**

At the end of the deployment, the deploy will spit out a domain name used for your deployment.  It is recommended to store this in the JSON5 configuration file in a comment.

## Setup Access Permissions
By default, the yarn deploy will create a deployment setup, but it will NOT be accessible for anyone because the s3
bucket isn't setup to be accessible.  You will need to add support for `Origin Access Control`.  The script previously had support for `Origin Access Identity`, and will almost have that setup, but the previous setup would start failing after more than  couple of deployments were completed, and AWS has not fixed CDK to allow deployment to `OAC` yet.

1. Login to the AWS web admin environment. 
2. Access the Cloudfront page
3. Select the cloudfront distribution you are using
4. Find the origin for each of the s3 deployments you have associated with that cloudfront distribution (typically root and client)
5. Edit each origin
  1. Under origin access, select Origin Access Control
  2. In the Origin Access Control, you will need to select an origin access control id to use - select either `StaticDICOMweb-OAC` or `AllowCloudFrontServicePrincipalReadOnly`
  3. Save
  4. You will see a yellow banner with `The S3 bucket policy needs to be updated`
  5. Copy the policy
  6. Go to s3 bucket policy permissions 
  7. Edit the bucket policy
  8. Paste the copied bucket policy
  9. Edit the s3 bucket "Block all public access", denying all public access (this prevents generic access to the bucket)

### Alternates for Access
You can setup generic access to your account for any cloudfront bucket by using `StringLike` and `*` instead of the distribution.  For example:
** Note, replace BUCKET_NAME and ACCOUNT_ID with your own bucket/account.  **  This is just the section of the policy that you need to add, but you
can easily replace the entire policy with the one copied from the cloudfront page, replacing just `"StringEquals"` with `"StringLike"` and replacing the end part of the `SourceArn` with `*`.

You will need to wait for deployment to complete before testing.  This can take minutes, so monitor the cloudfront distribution page to see when it is done.

```javascript
{
        "Version": "2008-10-17",
        "Id": "PolicyForCloudFrontPrivateContent",
        "Statement": [
            {
                "Sid": "AllowCloudFrontServicePrincipal",
                "Effect": "Allow",
                "Principal": {
                    "Service": "cloudfront.amazonaws.com"
                },
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::BUCKET_NAME/*",
                "Condition": {
                    "StringLike": {
                      "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/*"
                    }
                }
            }
        ]
      }
```

### User Authentication
Follow the instructions at (cloudfront authorization at edge)[https://github.com/aws-samples/cloudfront-authorization-at-edge] to add authorization.  It is recommended to use the option: `I already have a CloudFront distribution, I just want to add auth` and `I want to use a social identity provider` so that you can manually add users as required.  Of course, with a remote user identity provider, you can just redirect to a remote provider of identity.


## Deploy OHIF
You will need to deploy an OHIF version built with access to the path that you have specified in the URL.  For example, the `e2e` distribution works if you set the default data source name to be `dicomweb`.  Then, you can build with:

```javascript
cd <YOUR-OHIF-DIRECTORY>
cp platform/app/public/config/e2e.js platform/app/public/config/dicomweb.js
edit platform/app/public/config/dicomweb.js
# Update the value defaultDataSourceName to be "dicomweb"
APP_CONFIG=config/dicomweb.js yarn build
cp platform/app/dist ~/ohif/ -r
deploydicomweb client -d <YOUR-DEPLOYMENT-NAME>
```
