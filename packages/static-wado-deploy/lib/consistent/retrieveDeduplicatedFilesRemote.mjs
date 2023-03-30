import retrieveF from "../retrieveDeploy.mjs";

export default async function retrieveDeduplicatedFilesRemote(config, deployment, studyUID, options) {
  if (!deployment.deduplicatedGroup) {
    console.log("No deduplicatedGroup, not retrieving deduplicated");
    return;
  }
  console.log("retrieve deduplicated files from remote to local");

  const storeDirectory = `deduplicated/${studyUID}`;

  // This will retrieve deduplicated file, only if configured
  retrieveF(
    storeDirectory,
    deployment,
    "deduplicated",
    {
      ...options,
    },
    config.deployPlugin
  );
}
