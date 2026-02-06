/**
 * Parses a size string to bytes.
 * Accepts: kilobytes (10k, 10KB), megabytes (10m, 10MB), gigabytes (10g, 10GB), or terabytes (10t, 10TB).
 *
 * @param value - Size string (e.g. "10m", "10MB", "1.5g", "2t", "10485760")
 * @returns Size in bytes
 * @throws Error if value is invalid
 */
export function parseSizeToBytes(value: string): number {
  const str = String(value).trim();
  const lower = str.toLowerCase();
  const num = parseFloat(str.replace(/[kmgtb]/gi, '').trim());
  if (Number.isNaN(num) || num < 0) {
    throw new Error(
      `Invalid size "${value}": expected a size like 10k, 10m, 10g, 10t, 10KB, 10MB, 10GB, or 10TB`
    );
  }
  if (lower.endsWith('tb') || lower.endsWith('t')) return Math.round(num * 1024 * 1024 * 1024 * 1024);
  if (lower.endsWith('gb') || lower.endsWith('g')) return Math.round(num * 1024 * 1024 * 1024);
  if (lower.endsWith('mb') || lower.endsWith('m')) return Math.round(num * 1024 * 1024);
  if (lower.endsWith('kb') || lower.endsWith('k')) return Math.round(num * 1024);
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(num);
  throw new Error(
    `Invalid size "${value}": expected a size like 10k, 10m, 10g, 10t, 10KB, 10MB, 10GB, or 10TB`
  );
}
