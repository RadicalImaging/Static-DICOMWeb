import uploadDeploy from '../uploadDeploy.mjs';

export default async function storeDeduplicated(config, deployment, studyUID, options) {
  if (!deployment.deduplicatedGroup) {
    console.log('No deduplicatedGroup, not retrieving deduplicated');
    return;
  }

  const directory = `deduplicated/${studyUID}`;

  console.log('*************************************');
  console.log('Storing deduplicated files from', directory);

  // This will retrieve every index.json and metadata.json file, so no need to review individually
  const numResults = uploadDeploy(
    directory,
    deployment,
    'root',
    {
      ...options,
    },
    config.deployPlugin
  );

  return numResults;
}
