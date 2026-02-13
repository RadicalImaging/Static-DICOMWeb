import { StatusMonitor } from '@radicalimaging/static-wado-util';
import { getLivelockConfig, getLivelockReports } from '../../util/livelockRegistry.mjs';

/**
 * Build status payload (used by GET /status and by --show-status console dump).
 * @param {{ detailed?: boolean, includeLivelock?: boolean }} options
 * @returns {object}
 */
export function getStatusPayload(options = {}) {
  const { detailed = false, includeLivelock = false } = options;
  const summary = StatusMonitor.getSummary();
  const ongoingJobs = StatusMonitor.getOngoingJobs();
  const ongoingMax =
    ongoingJobs.length > 0
      ? {
          longestSecondsSinceProgress: Math.max(
            ...ongoingJobs.map(j => j.data.secondsSinceProgress ?? 0)
          ),
          longestSecondsSinceStarted: Math.max(
            ...ongoingJobs.map(j => j.data.secondsSinceStarted ?? 0)
          ),
        }
      : null;

  return {
    ...summary,
    ...(ongoingMax ? ongoingMax : {}),
    ...(detailed ? { ongoingJobs } : {}),
    ...(includeLivelock
      ? {
          livelock: {
            ...getLivelockConfig(),
            reports: getLivelockReports(),
          },
        }
      : {}),
  };
}

/**
 * GET /status (under server path, e.g. /dicomweb/status).
 * Returns JSON summary of job counts by type.
 * Query: ?detailed - include all ongoing jobs with per-job data (pretty-printed).
 * Query: ?livelock=true - include livelock config and reports in response (does not enable/disable detection).
 *
 * @param {object} req
 * @param {object} res
 */
export function statusController(req, res) {
  const detailed = req.query?.detailed !== undefined && req.query?.detailed !== '';
  const includeLivelock = req.query?.livelock === 'true' || req.query?.livelock === '1';
  const payload = getStatusPayload({ detailed, includeLivelock });

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload, null, 2));
}
