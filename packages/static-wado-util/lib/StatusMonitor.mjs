/**
 * Static class to track job statistics by type: running count, completed count,
 * and optional per-job data for ongoing jobs (e.g. for /status?detailed).
 *
 * Job types are arbitrary strings (e.g. 'stowPost', 'stowInstances').
 * Each job has a unique id, type, startedAt, and a mutable data object.
 */

let jobIdCounter = 0;
const runningJobs = new Map(); // jobId -> { type, startedAt, data }
const completedCountByType = new Map(); // typeId -> number
const failedCountByType = new Map(); // typeId -> number (subset of completed: aborted or failed)

/**
 * Generate a unique job id.
 * @returns {string}
 */
function nextJobId() {
  jobIdCounter += 1;
  return `job-${jobIdCounter}-${Date.now()}`;
}

/**
 * StatusMonitor static class.
 */
export class StatusMonitor {
  /**
   * Start a new job of the given type.
   * @param {string} typeId - Job type (e.g. 'stowPost', 'stowInstances')
   * @param {object} [initialData={}] - Initial data for the job (e.g. { parts: 0, totalBytes: 0 })
   * @returns {string} - Unique job id
   */
  static startJob(typeId, initialData = {}) {
    const id = nextJobId();
    runningJobs.set(id, {
      type: typeId,
      startedAt: Date.now(),
      data: { ...initialData },
    });
    return id;
  }

  /**
   * Update a running job's data. No-op if the job is not found or already completed.
   * @param {string} typeId - Job type
   * @param {string} jobId - Job id returned from startJob
   * @param {object} dataUpdates - Object to merge into job.data
   */
  static updateJob(typeId, jobId, dataUpdates) {
    const job = runningJobs.get(jobId);
    if (!job || job.type !== typeId) return;
    Object.assign(job.data, dataUpdates);
  }

  /**
   * End a job and move it to completed count.
   * If finalData.failed or finalData.aborted is truthy, or finalData.failedCount > 0, the job is counted as failed.
   * @param {string} typeId - Job type
   * @param {string} jobId - Job id
   * @param {object} [finalData={}] - Final data to merge (e.g. totalTimeMs, failed: true, aborted: true, failedCount: number)
   */
  static endJob(typeId, jobId, finalData = {}) {
    const job = runningJobs.get(jobId);
    if (!job || job.type !== typeId) return;
    runningJobs.delete(jobId);
    const count = completedCountByType.get(typeId) ?? 0;
    completedCountByType.set(typeId, count + 1);
    const isFailed =
      finalData.failed === true ||
      finalData.aborted === true ||
      (typeof finalData.failedCount === 'number' && finalData.failedCount > 0);
    if (isFailed) {
      const failedCount = failedCountByType.get(typeId) ?? 0;
      failedCountByType.set(typeId, failedCount + 1);
    }
  }

  /**
   * Get summary of job counts by type: running, completed, and failed (failed is a subset of completed).
   * @returns {{ jobTypes: Record<string, { running: number, completed: number, failed: number }> }}
   */
  static getSummary() {
    const byType = new Map();
    for (const job of runningJobs.values()) {
      const t = job.type;
      const entry = byType.get(t) ?? { running: 0, completed: 0, failed: 0 };
      entry.running += 1;
      byType.set(t, entry);
    }
    for (const [typeId, count] of completedCountByType) {
      const entry = byType.get(typeId) ?? { running: 0, completed: 0, failed: 0 };
      entry.completed = count;
      entry.failed = failedCountByType.get(typeId) ?? 0;
      byType.set(typeId, entry);
    }
    const jobTypes = Object.fromEntries(byType);
    return { jobTypes };
  }

  /**
   * Get all ongoing (running) jobs, optionally filtered by type.
   * Each item includes id, type, startedAt, and data (with computed fields if needed).
   * @param {string} [typeId] - If provided, only return jobs of this type
   * @returns {Array<{ id: string, type: string, startedAt: number, data: object }>}
   */
  static getOngoingJobs(typeId) {
    const now = Date.now();
    const result = [];
    for (const [id, job] of runningJobs) {
      if (typeId != null && job.type !== typeId) continue;
      const data = { ...job.data };
      if (data.lastBytesReceivedAt != null) {
        data.secondsSinceProgress = (now - data.lastBytesReceivedAt) / 1000;
        delete data.lastBytesReceivedAt; // report only "how long ago", not absolute time
      }
      if (job.startedAt != null) {
        data.secondsSinceStarted = (now - job.startedAt) / 1000;
      }
      result.push({
        id,
        type: job.type,
        data,
      });
    }
    return result;
  }

  /**
   * Reset all state (for tests).
   */
  static reset() {
    runningJobs.clear();
    completedCountByType.clear();
    failedCountByType.clear();
  }
}
