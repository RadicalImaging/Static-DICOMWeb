#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StaticSite } from './lib/static-site.js';
import awsConfig from './lib/awsConfig.mjs';
import staticWadoUtil from '@radical/static-wado-util';

const defaults = Object.create(awsConfig);
await staticWadoUtil.loadConfiguration(defaults, process.argv)

const app = new cdk.App();
console.log('env setup', defaults.s3Env);

/**
 * This stack relies on getting the domain name from CDK context.
 * Use 'cdk synth -c domain=mystaticsite.com -c subdomain=www'
 * Or add the following to cdk.json:
 * {
 *   "context": {
 *     "domain": "mystaticsite.com",
 *     "subdomain": "www",
 *     "accountId": 1234567890,
 *   }
 * }
**/
class MyStaticSiteStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props: cdk.StackProps, deployment: any) {
        super(parent, name, props);

        new StaticSite(this, deployment.name, deployment);
    }
}

function createDeployment(deployment) {
    new MyStaticSiteStack(app, `${deployment.name}-deployment`, {
        /**
         * This is required for our use of hosted-zone lookup.
         *
         * Lookups do not work at all without an explicit environment
         * specified; to use them, you must specify env.
         * @see https://docs.aws.amazon.com/cdk/latest/guide/environments.html
         */
        env: defaults.s3Env,
    }, 
    deployment
    );
}

const { deployments } = defaults;
if (deployments) {
    deployments.forEach((deployment) => createDeployment(deployment));
} else {
    const deployment = Object.assign(Object.create(defaults),  {name: "StaticSite"});
    createDeployment(deployment);
}

console.log('Doing the synth now');
app.synth();

