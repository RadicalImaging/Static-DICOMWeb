import { createJobManager } from '@radicalimaging/static-wado-util';

let jobManager = null;

/**
 * Returns the job manager of this server for builds of derived files. The query
 * controllers and the upload message handlers share it, so that one key has one
 * running build. Created on the first call from `params.maxRunningJobs` and
 * `params.maxQueuedJobs`. `params.jobManager` replaces it (for tests).
 *
 * @param {Object} [params] - Server params
 * @returns {ReturnType<typeof createJobManager>}
 */
export function getBuildJobManager(params = {}) {
  if (params.jobManager) {
    return params.jobManager;
  }
  if (!jobManager) {
    jobManager = createJobManager({
      maxRunning: params.maxRunningJobs,
      maxQueued: params.maxQueuedJobs,
    });
  }
  return jobManager;
}
