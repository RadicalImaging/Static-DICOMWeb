import { JSONReader, JSONWriter } from "@radicalimaging/static-wado-util";
import DeployGroup from "./DeployGroup.mjs";

// Simple in-memory cache for the duration of the upload
const indexCache = new Map();

/**
 * Batch processes multiple study indices
 * @param {Array} indices Array of study indices to process
 * @param {Array} allStudies Existing studies array
 * @returns {Array} Updated studies array
 */
function batchProcessIndices(indices, allStudies) {
  const sopMap = new Map(allStudies.map((study, index) => [study["0020000D"].Value[0], index]));
  
  indices.forEach(studyIndex => {
    // Handle both single study and array of studies
    const studies = Array.isArray(studyIndex) ? studyIndex : [studyIndex];
    
    studies.forEach(studyItem => {
      const sop = studyItem["0020000D"].Value[0];
      const existingIndex = sopMap.get(sop);
      
      if (existingIndex === undefined) {
        allStudies.push(studyItem);
        sopMap.set(sop, allStudies.length - 1);
      } else {
        allStudies[existingIndex] = studyItem;
      }
    });
  });
  
  return allStudies;
}

/**
 * Reads and caches index file
 * @param {string} rootDir Root directory
 * @param {string} indexPath Index file path
 * @returns {Promise<Array>} Index content
 */
async function getCachedIndex(rootDir, indexPath) {
  const cacheKey = `${rootDir}:${indexPath}`;
  let index = indexCache.get(cacheKey);
  
  if (!index) {
    index = await JSONReader(rootDir, indexPath, []);
    indexCache.set(cacheKey, index);
  }
  
  return index;
}

// Clear the entire cache after the operation is complete
function clearCache() {
  indexCache.clear();
}

/**
 * Reads the storeDirectory to get the index file, and adds that to the index directory
 */
export default async function uploadIndex(storeDirectory, config, name, options, deployPlugin) {
  const deployer = new DeployGroup(config, name, options, deployPlugin);
  const { indexFullName } = deployer;
  if (!indexFullName) {
    console.log("No index defined in group", deployer.group);
    return;
  }

  await deployer.loadOps();
  console.log("Starting to update indices for", storeDirectory);
  const { config: deployConfig } = deployer;

  try {
    // Read indices with caching
    const [allStudies, studyIndex] = await Promise.all([
      getCachedIndex(deployConfig.rootDir, indexFullName),
      getCachedIndex(deployConfig.rootDir, `${storeDirectory}/index.json.gz`)
    ]);

    // Process indices in batch
    const updatedStudies = batchProcessIndices([studyIndex], allStudies);

    // Write updated index and upload
    await JSONWriter(deployConfig.rootDir, indexFullName, updatedStudies, { 
      index: false,
      compression: 'gzip' // Enable compression for index files
    });
    
    await deployer.store(indexFullName);
    
    // Update cache with new data
    indexCache.set(`${deployConfig.rootDir}:${indexFullName}`, updatedStudies);
    
  } catch (error) {
    console.error("Failed to update index:", error);
    throw error;
  } finally {
    // Clear the cache to allow process to exit cleanly
    clearCache();
  }
}
