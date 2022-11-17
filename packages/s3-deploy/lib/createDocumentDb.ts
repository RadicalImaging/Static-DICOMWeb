#!/usr/bin/env node
import { Construct } from 'constructs';
import * as docdb from 'aws-cdk-lib/aws-docdb';

function createDocumentDb(site: Construct, group) {
  console.log("Creating documentDB", group);
  const id = group.id || 'dicomweb-index';
  const dbCluster = new docdb.CfnDBCluster(site, `${id}-cluster`, {
    storageEncrypted: false,
    dbClusterIdentifier: id,
    masterUsername: group.dbUsername || 'dicomweb',
    masterUserPassword: group.dbPassword || 'dicomwebPw',
  });
  
  const dbInstance = new docdb.CfnDBInstance(site, `${id}-instance`, {
    dbClusterIdentifier: id,
    autoMinorVersionUpgrade: true,
    dbInstanceClass: "db.t3.medium",
    dbInstanceIdentifier: `${id}-dicomweb`,
  });
  dbInstance.addDependsOn(dbCluster);
  
  console.log("Created database", dbInstance);

}

export default createDocumentDb;