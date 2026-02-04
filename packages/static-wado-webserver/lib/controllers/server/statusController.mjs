import { StatusMonitor } from '@radicalimaging/static-wado-util';
import {
  setLivelockEnabled,
  getLivelockConfig,
  getLivelockReports,
} from '../../util/livelockRegistry.mjs';

/**
 * GET /status (under server path, e.g. /dicomweb/status).
 * Returns JSON summary of job counts by type.
 * Query: ?detailed - include all ongoing jobs with per-job data (pretty-printed).
 * Query: ?livelock=true - enable livelock detection and include config + reports in response.
 * Query: ?livelock=false - disable livelock detection; response includes current livelock state.
 *
 * @param {object} req
 * @param {object} res
 */
export function statusController(req, res) {
  const summary = StatusMonitor.getSummary();
  const detailed = req.query?.detailed !== undefined && req.query?.detailed !== '';
  const livelockParam = req.query?.livelock;

  if (livelockParam === 'true' || livelockParam === '1') {
    setLivelockEnabled(true);
  } else if (livelockParam === 'false' || livelockParam === '0') {
    setLivelockEnabled(false);
  }

  const includeLivelock =
    livelockParam !== undefined && livelockParam !== '';

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

  const payload = {
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

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload, null, 2));
}
