import { JSONReader, JSONWriter, handleHomeRelative } from "@radicalimaging/static-wado-util";
import DeployGroup from "./DeployGroup.mjs";

/**
 * Reads the storeDirectory to get the index file, and adds that to the index directory
 * 
 */
export default async function uploadIndex(storeDirectory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  const { indexFullName } = deployer;
  if (!indexFullName) {
    console.log("No index defined in group", deployer.group);
    return;
  }
  console.log("Starting to update indices for", storeDirectory, deployer);
  const { config: deployConfig } = deployer;

  // Read the index file, or create a dummy one:
  const allStudies = await JSONReader(deployConfig.rootDir, indexFullName, []);
  const studyIndex = await JSONReader(deployConfig.rootDir, `${storeDirectory}/index.json.gz`);
  const studyItem = studyIndex[0] || studyIndex;
  const sop = studyItem["0020000D"].Value[0];
  const allIndex = allStudies.findIndex(it => it["0020000D"].Value[0]===sop);
  if (allIndex === -1) {
    allStudies.push(studyItem);
  } else {
    allStudies[allIndex] = studyItem;
  }
  await JSONWriter(deployConfig.rootDir, indexFullName, allStudies, { index: false });
  await deployer.loadOps();
  await deployer.store(indexFullName);
}
