import { sleep, NotificationService } from "@radicalimaging/static-wado-util";

import retrieveIndexFilesRemote from "./consistent/retrieveIndexFilesRemote.mjs";
import retrieveDeduplicatedFilesRemote from "./consistent/retrieveDeduplicatedFilesRemote.mjs";
import metadataDicom from "./consistent/metadataDicom.mjs";
import uploadDicomWeb from "./consistent/uploadDicomWeb.mjs";
import storeDeduplicated from "./consistent/storeDeduplicated.mjs";

/**
 * Make the study eventually consistent.
 *
 * 1. Read the index files from remote
 *    1. Index files are study/series query, deduplicated, series metadata
 * 2. Read the deduplicated files from remote if configured
 * 3. Validate the hash code for each index file
 * 4. Update the metadata tree (regroup as necessary)
 * 5. Done if upload was empty
 *    1. Exit with code 0 when done
 */
export async function eventuallyConsistent(config, deployment, studyUID, options) {
  // The index files are required for all updates to a study.
  await retrieveIndexFilesRemote(config, deployment, studyUID, options);

  // Deduplicated files are only required for distributed concurrent updates to a single study
  await retrieveDeduplicatedFilesRemote(config, deployment, studyUID, options);

  // Then write metadata files, which will group deduplicated single instance files and write metadata updates, only
  // if the group files are need it, or the dirtyValidation above failed
  await metadataDicom(config, deployment, studyUID, {
    options,
    notifications: false,
  });

  // The store count will return the number of instances actually uploaded,
  // which is all we care about in the end as that indicates if this is a dirty update or not
  const storeStudyCount = await uploadDicomWeb(config, deployment, studyUID, options);

  // Optionally store the deduplicated files for distributed eventually consistent updates
  await storeDeduplicated(config, deployment, studyUID, options);

  return storeStudyCount;
}

/**
 * 1-5. Up above
 * 6. If any retries left, delay X seconds and goto #1
 * 7. Exit with code 1
 *
 * This can be used by a receive process to import safely by:
 *    1. Periodically call the import process, with no retries
 *    2. When done, wait for previous import process
 *    3. Start a clean import process with 3 retries
 *
 * It can be used by a single threaded (per studyUID) to import safely when steps 2 and 4.3 are skipped
 */
export default async function updateConsistencyMain(studyUID, options) {
  const { retries, delay = 5000 } = options;
  const deployPlugin = this.deployPlugin;
  console.log("Store and upload consistent files to", deployPlugin);
  const deployments = this.deployments;
  const deployment = deployments.find((it) => it.rootGroup && options.deployments.includes(it.name));
  if (!deployment) throw new Error(`Deployment ${options.deployments} not found`);
  const notificationService = new NotificationService(options.notificationDir);

  for (let retry = 0; retry < retries; retry++) {
    if (retry > 0) await sleep(delay);
    try {
      const consistentCount = await eventuallyConsistent(this, deployment, studyUID, options);
      if (consistentCount === 0) {
        console.log("Consistent study", studyUID);
        return 0;
      }
      console.log("There were", consistentCount, "uploads required, study not consistent yet");
    } catch (e) {
      console.log("Error trying to make consistent:", e);
    }
  }

  notificationService.notifyStudy(studyUID);
  return -1;
}
