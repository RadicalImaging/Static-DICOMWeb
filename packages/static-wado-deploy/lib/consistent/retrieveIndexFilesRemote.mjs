import retrieveF from "../retrieveDeploy.mjs";

/**
 * Retrieves the index files from a remote deploy.
 * This will retrieve:
 *   1. <studyDir>/index.json.gz locally
 *   2. <studyDir>/deduplicated/index.json.gz
 *   3. For each studyUID in #1,   <studyDir>/series/<seriesUID>/index.json.gz
 *   4. For each studyUID in #1,   <studyDir>/series/<seriesUID>/metadata.json.gz
 * 
 * @param {*} studyUID 
 * @param {*} options 
 */
export default async function retrieveIndexFilesRemote(config, deployment, studyUID, options) {
  const storeDirectory = `studies/${studyUID}`;

  // This will retrieve every index.json and metadata.json file, so no need to review individually
  retrieveF(storeDirectory, deployment, "root", {
    ...options,
    force: true,
    include: ['index.json', "metadata.json"],
  }, config.deployPlugin);
}