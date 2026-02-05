/**
 * Registry of livelock detections from TrackableReadBufferStream.
 * When ?livelock=true on GET /status, the response includes config and reports (read-only).
 * Detection is enabled at server startup via --livelock-detect.
 */

const MAX_REPORTS = 50;
const DEFAULT_LIVELOCK_DETECT_MS = 15000;

const reports = [];
/** When true, TrackableReadBufferStream uses livelock detection (env or default ms). Set via --livelock-detect at startup. */
let detectionEnabled = false;

/**
 * Get the livelock detect ms from env, or default when detection is enabled.
 * @returns {number} - 0 if detection is disabled, else TRACKABLE_STREAM_LIVELOCK_DETECT_MS or DEFAULT_LIVELOCK_DETECT_MS
 */
function getEnvLivelockDetectMs() {
  const envMs = parseInt(
    typeof process !== 'undefined' && process.env.TRACKABLE_STREAM_LIVELOCK_DETECT_MS,
    10
  );
  return Number.isFinite(envMs) ? envMs : DEFAULT_LIVELOCK_DETECT_MS;
}

/**
 * Enable or disable livelock detection. Called at startup when --livelock-detect is passed.
 * When enabling, threshold is TRACKABLE_STREAM_LIVELOCK_DETECT_MS env or 15000 ms.
 * @param {boolean} enabled
 */
export function setLivelockEnabled(enabled) {
  detectionEnabled = !!enabled;
}

/**
 * Returns the ms threshold to pass to TrackableReadBufferStream: 0 if detection is disabled,
 * otherwise env TRACKABLE_STREAM_LIVELOCK_DETECT_MS or 15000.
 * @returns {number}
 */
export function getLivelockDetectMs() {
  if (!detectionEnabled) return 0;
  return getEnvLivelockDetectMs();
}

/**
 * Record a livelock detection. Called from TrackableReadBufferStream when
 * ensureAvailable() is still pending after livelockDetectMs.
 *
 * @param {object} detail
 * @param {number} detail.bytes - ensureAvailable(bytes) argument
 * @param {number} detail.offset - stream offset at detection time
 * @param {number} detail.endOffset - stream endOffset
 * @param {boolean} detail.isComplete - stream isComplete
 * @param {number} detail.livelockDetectMs - configured threshold ms
 * @param {string} detail.stack - stack trace at ensureAvailable call
 */
export function recordLivelock(detail) {
  const entry = {
    ...detail,
    detectedAt: Date.now(),
  };
  reports.push(entry);
  if (reports.length > MAX_REPORTS) {
    reports.shift();
  }
}

/**
 * Get recent livelock reports (newest last). Does not clear them.
 * @returns {Array<object>}
 */
export function getLivelockReports() {
  return [...reports];
}

/**
 * Get livelock config for status response: enabled flag and ms threshold in use.
 * @returns {{ enabled: boolean, livelockDetectMs: number }}
 */
export function getLivelockConfig() {
  const enabled = detectionEnabled;
  const livelockDetectMs = enabled ? getEnvLivelockDetectMs() : 0;
  return {
    enabled,
    livelockDetectMs,
  };
}
