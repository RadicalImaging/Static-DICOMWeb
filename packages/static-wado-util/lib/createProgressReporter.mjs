/**
 * Creates a progress reporter that writes an updating progress bar to stdout.
 * Used when neither quiet nor verbose are enabled.
 *
 * @param {Object} options
 * @param {number} [options.total] - Total number of items (files, etc.). If omitted, shows count only.
 * @param {boolean} [options.enabled=true] - Whether to output progress. When false, update/finish are no-ops.
 * @param {string} [options.label='files'] - Label for the progress display
 * @param {() => string} [options.getExtraInfo] - Optional function returning extra text to append (e.g. stream write counts)
 * @returns {{ setTotal: (n: number) => void, addProcessed: (n?: number) => void, refresh: () => void, finish: () => void }}
 */
export function createProgressReporter(options = {}) {
  const { total: initialTotal = 0, enabled = true, label = 'files', getExtraInfo } = options;

  let total = initialTotal;
  let processed = 0;

  function setTotal(n) {
    total = n;
  }

  function render() {
    if (!enabled) return;
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    const barLen = 25;
    const filled = total > 0 ? Math.floor((percentage / 100) * barLen) : 0;
    const progressBar = '='.repeat(filled) + '-'.repeat(barLen - filled);
    const pct = total > 0 ? ` ${percentage}% |` : '';
    const count = total > 0 ? `${processed}/${total}` : `${processed}`;
    const extra = typeof getExtraInfo === 'function' ? getExtraInfo() : '';
    process.stdout.write(`\r[${progressBar}]${pct} ${count} ${label}${extra}`);
  }

  function addProcessed(n = 1) {
    if (!enabled) return;
    processed += n;
    render();
  }

  function refresh() {
    render();
  }

  function finish() {
    if (!enabled) return;
    process.stdout.write('\n');
  }

  return { setTotal, addProcessed, refresh, finish };
}
