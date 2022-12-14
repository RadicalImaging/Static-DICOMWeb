import commonMain from "./commonMain.mjs";

async function indexCurie(jobName, config,name,options, deployer) {
  console.log("Initiating local index of <curieDir>", jobName, deployer.group);
  // Search for all files <dicomDir>/studies/metadataTree.json.gz
  // Read the file
  // Combine patient/studies and patient/studies/series
  // Write out natural.json and seriesNatural.json
  // Denaturalize and write out index.json and series.json
  // Call the re-index function to generate the top level index
}

export default async function (jobName, options) {
  await commonMain(this, "upload", options, indexCurie.bind(null,jobName));
}
