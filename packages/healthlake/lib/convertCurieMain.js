import commonMain from "./commonMain.mjs";
import readJobInfo from "./readJobInfo.mjs";
import {execFileSync} from "node:child_process";
import {JSONWriter} from "@radicalimaging/static-wado-util";

const findNextName = async (destPath, jobName) => {
  if( await readJobInfo(destPath,jobName)===null ) return jobName;
  for(let i=1; i<100; i++) {
    const testName = `${jobName}-${i}`;
    if( await readJobInfo(destPath,testName)===null ) return testName;
  }
  throw new Error("Couldn't find a job name to use "+jobName);
}

async function convertCurie(leiName, config,name,options, deployer) {
  console.log("Initiating convert curie job", leiName, deployer.group);
  const destPath = `${deployer.baseDir}/jobs`;

  // Search for <curieDir>/jobs/<jobName> to find a new job name
  const jobName = await findNextName(destPath, options.jobName || leiName);
  const { datastoreId, dataAccessRole, outputS3Uri, Bucket } = deployer.group;
  const commandLine = `aws medical-imaging start-dicom-import-job  --job-name "${jobName}" --datastore-id "${datastoreId}" --input-s3-uri "s3://${Bucket}/lei/${leiName}/" --output-s3-uri "${outputS3Uri}/jobs/${jobName}/" --data-access-role-arn "${dataAccessRole}" --region us-east-1`;
  console.log("Initiating", commandLine);
  const resultsStr = execFileSync(commandLine, {shell:true}).toString();
  console.log("Results", resultsStr);
  const results = JSON.parse(resultsStr);
  // Capture the output to <curieDir>/jobs/<jobName>, throwing an exception if not submitted
  results.leiName = leiName;
  await JSONWriter(`${destPath}/${jobName}`, "info.json", results, {index:false, gzip:false});
  return jobName;
}

export default async function (inputName, options) {
  await commonMain(this, "upload", options, convertCurie.bind(null,inputName));
}
