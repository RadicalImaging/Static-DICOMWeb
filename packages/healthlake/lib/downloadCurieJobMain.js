import commonMain from "./commonMain.mjs";
import readJobInfo from "./readJobInfo.mjs";
import {execFileSync} from "node:child_process";
import path from "path";
import {NDJSONReader, JSONReader, JSONWriter} from "@radicalimaging/static-wado-util";
import fs from "fs";
import dcmjs from "dcmjs";

const { denaturalizeDataset } = dcmjs.data.DicomMetaDictionary;

const asArray = (v) => Array.isArray(v) ? v : [v];

function unique(arr) {
  const keys = {};
  arr.forEach(key => keys[key] = key);
  return Object.keys(keys);
}

const extractImageSetIds = (s) => unique(asArray(s).map(it => it.importResponse.imageSetId));

// Should really be called with the baseDir of the dicomweb output tree....
async function convertTreeMetadata(trees, baseDir) {
  for(const tree of trees) {
    const studyTree = await JSONReader(path.dirname(tree), path.basename(tree));
    const { DatastoreID, ImageSetID, Patient, Study } = studyTree;
    const studyRecord = Object.assign({}, Patient.DICOM, Study.DICOM);
    studyRecord.StudyID = ImageSetID;
    studyRecord.DeviceUID = DatastoreID;
    const { StudyInstanceUID } = studyRecord;
    const studyDir = path.join(baseDir,"studies", StudyInstanceUID);
    const studyIndex = denaturalizeDataset(studyRecord);
    console.log("study index object", studyIndex);
    
    return Promise.all([
      JSONWriter(studyDir, "metadataTree.json", studyTree, {gzip:true}),
      JSONWriter(studyDir, "study.json", studyRecord, {gzip:true}),
      JSONWriter(studyDir, "index.json", [studyIndex], {gzip:true}),
      JSONWriter(studyDir, `${ImageSetID}.json`, studyTree, {gzip: true}),
    ]);
  }
}

async function getImageFrames(trees, baseDir) {
  console.log("TODO - change the path mapping to standard DICOM paths")
  for(const tree of trees) {
    console.log("Reading tree", tree);
    const studyTree = await JSONReader(path.dirname(tree), path.basename(tree));
    const { DatastoreID, DICOMStudyID, Study } = studyTree;
    const { Series } = Study;
    const htj2kDir = path.join(baseDir, "studies/htj2k", DatastoreID, DICOMStudyID);
    fs.mkdirSync(htj2kDir,{recursive: true});
    for(const singleSeries of Object.values(Series) ) {
      const { Instances } = singleSeries;
      if( !Instances ) continue;
      for(const instance of Object.values(Instances) ) {
        const { ImageFrames } = instance;
        if( !ImageFrames ) continue;
        const imageIds = ImageFrames.map(it => it.ID);
        console.log("Fetching", imageIds.length, "images");
        for (const id of imageIds) {
          const file = path.join(htj2kDir,`${id}.jhc`)
          const commandLine = `aws medical-imaging get-image-frame  --datastore-id "${DatastoreID}" --study-id ${DICOMStudyID} --image-frame-id ${id} --region us-east-1 ${file}`;
          const resultsStr = execFileSync(commandLine, {shell:true}).toString();
          console.log(resultsStr);
          console.log("Fetched htj2k", htj2kDir, id);            
        }
      }
    }
  }
}

async function getDicomImportJob(group, jobId) {
  const { datastoreId, } = group;
  const commandLine = `aws medical-imaging get-dicom-import-job  --datastore-id "${datastoreId}" --job-id "${jobId}" --region us-east-1`;
  const resultsStr = execFileSync(commandLine, {shell:true}).toString();
  const results = JSON.parse(resultsStr);
  return results;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const isWorking = ({jobStatus}) => jobStatus==="SUBMITTED" || jobStatus==="IN_PROGRESS";

async function readJobProperties(current, group,jobId) {
  let importJob;
  for(let i=0; i<20 && isWorking(importJob?.jobProperties || current); i++) {
    importJob = await getDicomImportJob(group, jobId);
    console.log("Got importJob", importJob);    
    if( isWorking(importJob?.jobProperties) ) {
      console.log("Got intermediate status", importJob?.jobProperties?.jobStatus);
      await sleep(2000);
    }
  }
  return importJob?.jobProperties || current;
}

async function readSuccessFailure(baseDir, outputPath) {
  const successDir = path.join(baseDir,outputPath, "SUCCESS");
  const successFile = "success.ndjson";
  const failureDir = path.join(baseDir,outputPath, "FAILURE");
  const failureFile = "failure.ndjson";
  console.log("Retrieved job status to", successDir, successFile);
  const success = await NDJSONReader(successDir,successFile);
  let failure;
  try {
    failure = await NDJSONReader(failureDir, failureFile);
  } catch(e) {
    console.log("No failures");
  }
  return {success, failure};
}

function downloadTreeMetadata(group, imageSetIds, baseDir) {
  const { datastoreId, } = group;
  const ret = [];
  for (const imageSetId of imageSetIds) {
    const destFile = path.join(baseDir,"treeMetadata", datastoreId, `${imageSetId}.json`);
    if( !fs.existsSync(path.dirname(destFile))) {
      fs.mkdirSync(path.dirname(destFile), {recursive: true});
    }
    const commandLine = `aws medical-imaging get-dicom-study-metadata  --datastore-id ${datastoreId} --study-id ${imageSetId} --region us-east-1 "${destFile}"`;
    const resultsStr = execFileSync(commandLine, { shell: true, stdio: 'inherit' });
    console.log("Downloaded tree metadata to", destFile);
    ret.push(destFile);
  }
  return ret;
}

async function downloadCurie(jobName, config,name,options, deployer) {
  const { group, baseDir } = deployer;
  console.log("Initiating convert curie job", jobName, group, baseDir);
  const jobInfo = await readJobInfo(baseDir, jobName);
  console.log("jobInfo=", jobInfo);
  const { jobId } = jobInfo;

  const jobProperties = await readJobProperties(jobInfo, group,jobId);
  JSONWriter(path.join(baseDir, "jobs", jobName), "info.json", jobProperties, {index:false, gzip:false});

  const { outputS3Uri } = jobProperties;
  console.log("Job is completed", outputS3Uri);
  const remoteUri = group.outputS3Uri;
  const outputPath = outputS3Uri.substring(remoteUri.length+1);
  console.log("remoteUri,outputPath", remoteUri, outputPath);

  await deployer.retrieve({remoteUri},outputPath);

  const destinationDir = `${remoteUri}/${outputPath}`;

  const {success, failure} = await readSuccessFailure(baseDir, outputPath);
  console.log("success file contents=", success, failure);
  const imageSetIds = extractImageSetIds(success);

  const trees = downloadTreeMetadata(group, imageSetIds, baseDir);

  await convertTreeMetadata(trees, baseDir);
  if( config.retrieveHtj2k ) {
    await getImageFrames(trees,baseDir);
  }

  return destinationDir;
}

export default async function (jobName, options) {
  await commonMain(this, "upload", options, downloadCurie.bind(null,jobName));
}
