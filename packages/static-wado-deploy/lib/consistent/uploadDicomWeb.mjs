import uploadDeploy from "../uploadDeploy.mjs";

export default function uploadDicomWeb(config, deployment, studyUID, options) {
  const directory = `studies/${studyUID}`;

  console.log('*************************************');  
  console.log("Uploading DICOMweb files from", directory);
  
  // This will retrieve every index.json and metadata.json file, so no need to review individually
  const numResults = uploadDeploy(directory, deployment, "root", {
    ...options,
  }, config.deployPlugin);

  return numResults;
}