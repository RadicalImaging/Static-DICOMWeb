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
    studyRecord.ModalitiesInStudy = [];
    studyRecord.NumberOfStudyRelatedInstances = 0;
    studyRecord.NumberOfStudyRelatedSeries = 0;
    Object.values(Study.Series).forEach(series => {
      const { Modality } = series.DICOM;
      studyRecord.NumberOfStudyRelatedSeries += 1;
      if( studyRecord.ModalitiesInStudy.indexOf(Modality)==-1 ) {
        studyRecord.ModalitiesInStudy.push(Modality);
      }
      Object.values(series.Instances).forEach(instance => {
        studyRecord.NumberOfStudyRelatedInstances += (instance.DICOM.NumberOfFrames || 1);
      });
    });
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
  for(const tree of trees) {
    const studyTree = await JSONReader(path.dirname(tree), path.basename(tree));
    const { DatastoreID, ImageSetID, Study } = studyTree;
    const { Series } = Study;
    const { StudyInstanceUID:studyUID } = Study.DICOM;
    const studyDir = path.join(baseDir, "studies", studyUID);
    Object.values(Series).forEach(series => {
      const { Instances } = series;
      if( !Instances ) return;
      const { SeriesInstanceUID: seriesUID } = series.DICOM;
      const seriesDir = path.join(studyDir, "series", seriesUID);
      Object.values(Instances).forEach(instance => {
        const { ImageFrames } = instance;
        if( !ImageFrames ) return;
        const { SOPInstanceUID: instanceUID } = instance.DICOM;
        const framesDir = path.join(seriesDir, "instances", instanceUID, "frames");
        fs.mkdirSync(framesDir, {recursive: true});
        for( let frame=1; frame <= ImageFrames.length; frame++) {
          const id = ImageFrames[frame-1].ID;
          const file = path.join(framesDir, `${frame}.jhc`);
          const commandLine = `aws medical-imaging get-image-frame  --datastore-id "${DatastoreID}" --image-set-id ${ImageSetID} --image-frame-id ${id} --region us-east-1 ${file}`;
          verboseLog("getting image frame", commandLine);
          execFileSync(commandLine, {shell:true, stdio: 'inherit' });
        }
      });
    });
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
    const destFile = path.join(baseDir,"treeMetadata", datastoreId, `${imageSetId}.json.gz`);
    if( !fs.existsSync(path.dirname(destFile))) {
      fs.mkdirSync(path.dirname(destFile), {recursive: true});
    }
    const commandLine = `aws medical-imaging get-image-set-metadata  --datastore-id ${datastoreId} --image-set-id ${imageSetId} --region us-east-1 "${destFile}"`;
    verboseLog("Downloading tree metadata", commandLine);
    execFileSync(commandLine, { shell: true, stdio: 'inherit' });
    console.log("Downloaded tree metadata to", destFile);
    ret.push(destFile);
  }
  return ret;
}

async function downloadCurie(jobName, config,name,options, deployer) {
  const { group, baseDir } = deployer;
  console.log("Initiating convert curie job", jobName, group, baseDir);
  const jobInfo = await readJobInfo(baseDir, jobName);
  verboseLog("jobInfo=", jobInfo);
  const { jobId } = jobInfo;

  const jobProperties = await readJobProperties(jobInfo, group,jobId);
  JSONWriter(path.join(baseDir, "jobs", jobName), "info.json", jobProperties, {index:false, gzip:false});

  const { outputS3Uri } = jobProperties;
  console.log("Job is completed", outputS3Uri);
  const remoteUri = group.outputS3Uri;
  const outputPath = outputS3Uri.substring(remoteUri.length+1);
  verboseLog("remoteUri,outputPath", remoteUri, outputPath);

  await deployer.retrieve({remoteUri},outputPath);

  const destinationDir = `${remoteUri}/${outputPath}`;

  const {success, failure} = await readSuccessFailure(baseDir, outputPath);
  verboseLog("success file contents=", success, failure);
  const imageSetIds = extractImageSetIds(success);
  verboseLog("imageSetIds", imageSetIds);

  const trees = downloadTreeMetadata(group, imageSetIds, baseDir);

  await convertTreeMetadata(trees, baseDir);
  if( config.retrieveHtj2k || options.downloadImages ) {
    console.log("Downloading images", baseDir);
    await getImageFrames(trees,baseDir);
  }

  return destinationDir;
}

let verboseLog = () => {};

export default async function (jobName, options) {
  verboseLog = console.log.bind(console);
  await commonMain(this, "upload", options, downloadCurie.bind(null,jobName));
}
