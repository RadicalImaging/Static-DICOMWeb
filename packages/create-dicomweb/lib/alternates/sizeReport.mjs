import fs from 'fs';
import path from 'path';

/**
 * Total size on disk of a directory tree, in bytes. Missing directories count as zero, which
 * is what a rendition that was not requested should contribute.
 *
 * Sizes come from the filesystem rather than from what was written, so a run that skipped work
 * because the output already existed reports the same numbers as the run that created it.
 *
 * @param {string} dir - Absolute directory path
 * @returns {Promise<number>} - Bytes
 */
export async function directorySize(dir) {
  let total = 0;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(full);
    } else if (entry.isFile()) {
      total += (await fs.promises.stat(full)).size;
    }
  }
  return total;
}

/**
 * Sums a per-instance rendition directory (`frames`, `jls`, `jlsThumbnail`) over every instance.
 * @param {string} seriesDir - Absolute path of the series directory
 * @param {string[]} instanceUids - Instance UIDs to include
 * @param {string} renditionName - Directory name beneath each instance
 * @returns {Promise<number>} - Bytes
 */
export async function instanceRenditionSize(seriesDir, instanceUids, renditionName) {
  let total = 0;
  for (const instanceUid of instanceUids) {
    total += await directorySize(path.join(seriesDir, 'instances', instanceUid, renditionName));
  }
  return total;
}

/**
 * Builds one rendition's entry in the report.
 * @param {Object} params - Rendition parameters
 * @param {string} params.name - Rendition name, e.g. 'jls'
 * @param {number} params.bytes - Bytes on disk
 * @param {number} params.uncompressedBytes - Raw voxel bytes at this rendition's own dimensions
 * @param {string} [params.dimensions] - Human readable dimensions
 * @param {Object[]} [params.levels] - Per-level breakdown, for the brick store
 * @param {boolean} [params.lossy] - Whether the encoding discards data
 * @returns {Object}
 */
export function rendition({ name, bytes, uncompressedBytes, dimensions, levels, lossy }) {
  return {
    name,
    bytes,
    uncompressedBytes,
    ratio: bytes > 0 ? uncompressedBytes / bytes : null,
    ...(dimensions ? { dimensions } : {}),
    ...(levels ? { levels } : {}),
    // Recorded rather than left implicit in the name, so a ratio is never read as comparable
    // with a lossless one by accident.
    ...(lossy ? { lossy: true } : {}),
  };
}

/**
 * Formats a byte count with a unit, keeping the column widths in the summary stable.
 * @param {number} bytes - Bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return '     n/a';
  }
  const units = [
    { limit: 1024 ** 3, suffix: 'GB' },
    { limit: 1024 ** 2, suffix: 'MB' },
    { limit: 1024, suffix: 'KB' },
  ];
  for (const { limit, suffix } of units) {
    if (bytes >= limit) {
      const value = bytes / limit;
      return `${value.toFixed(value >= 100 ? 1 : 2)} ${suffix}`;
    }
  }
  return `${bytes} B`;
}

/**
 * Formats a compression ratio as `n.nn:1`.
 * @param {number|null} ratio - Ratio, or null when nothing was written
 * @returns {string}
 */
export function formatRatio(ratio) {
  return ratio == null ? 'n/a' : `${ratio.toFixed(2)}:1`;
}

/**
 * Formats a percentage relative to the base frames.
 * @param {number|null} fraction - Fraction of frames/ size, or null when frames/ is empty
 * @returns {string}
 */
export function formatPercent(fraction) {
  if (fraction == null) {
    return 'n/a';
  }
  return `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`;
}

/**
 * Aggregates per-series reports into a study total.
 *
 * The overall ratio is the total raw voxel bytes of everything written divided by the total
 * bytes on disk, not the mean of the per-rendition ratios: renditions differ in size by orders
 * of magnitude, so a mean of ratios would let a 10KB level count as much as a 300MB one.
 *
 * @param {Object[]} seriesReports - Per-series reports
 * @returns {Object} - Study totals
 */
export function summarizeStudy(seriesReports) {
  let bytes = 0;
  let uncompressed = 0;
  let framesBytes = 0;
  let brickBytes = 0;
  let anyBricks = false;

  for (const report of seriesReports) {
    for (const entry of report.renditions) {
      bytes += entry.bytes;
      uncompressed += entry.uncompressedBytes;
      if (entry.name === 'frames') {
        framesBytes += entry.bytes;
      } else if (entry.name === 'brick') {
        brickBytes += entry.bytes;
        anyBricks = true;
      }
    }
  }

  return {
    bytes,
    uncompressedBytes: uncompressed,
    ratio: bytes > 0 ? uncompressed / bytes : null,
    framesBytes,
    brickBytes,
    // Left null rather than zero when no brick store was written, so "no bricks" and
    // "bricks that cost nothing" do not read the same.
    brickOverheadOfFrames: anyBricks && framesBytes > 0 ? brickBytes / framesBytes : null,
  };
}

/**
 * Renders the human readable summary.
 * @param {Object[]} seriesReports - Per-series reports
 * @param {Object} totals - Result of summarizeStudy
 * @returns {string[]} - Lines to print
 */
export function formatSummary(seriesReports, totals) {
  const lines = [];

  for (const report of seriesReports) {
    lines.push(
      `series ${report.seriesInstanceUID}   ${report.modality ?? '??'}   ${report.dimensions}`
    );
    for (const entry of report.renditions) {
      let line = `  ${`${entry.name}/`.padEnd(15)} ${formatBytes(entry.bytes).padStart(9)}   ratio ${formatRatio(entry.ratio)}`;
      if (entry.lossy) {
        line += ' lossy';
      }
      if (entry.name === 'brick' && report.brickOverheadOfFrames != null) {
        line += `     ${formatPercent(report.brickOverheadOfFrames)} of frames/`;
      }
      lines.push(line);
      if (entry.levels?.length) {
        lines.push(
          `    ${entry.levels.map(level => `${level.name} ${formatBytes(level.bytes)}`).join('   ')}`
        );
      }
    }
    if (report.skipped?.length) {
      for (const skip of report.skipped) {
        lines.push(`  skipped ${skip.rendition}: ${skip.reason}`);
      }
    }
  }

  let total = `study total     ${formatBytes(totals.bytes).padStart(9)}   overall ${formatRatio(totals.ratio)}`;
  if (totals.brickOverheadOfFrames != null) {
    total += `   bricks ${formatPercent(totals.brickOverheadOfFrames)} of frames/`;
  }
  lines.push(total);

  return lines;
}
