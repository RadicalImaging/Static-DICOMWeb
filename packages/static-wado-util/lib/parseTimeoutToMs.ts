/**
 * Parses a timeout/duration string to milliseconds.
 * Accepts: hours (10h), minutes (10m), or seconds (3600 or 3600s).
 *
 * @param value - Duration string (e.g. "10h", "30m", "3600", "3600s")
 * @returns Timeout in milliseconds
 * @throws Error if value is invalid
 */
export function parseTimeoutToMs(value: string): number {
  const str = String(value).trim().toLowerCase();
  const num = parseFloat(str.replace(/[hms]/g, '').trim());
  if (Number.isNaN(num) || num < 0) {
    throw new Error(
      `Invalid timeout "${value}": expected a duration like 10h, 10m, 3600, or 3600s`
    );
  }
  if (str.endsWith('h')) return Math.round(num * 3600 * 1000);
  if (str.endsWith('m')) return Math.round(num * 60 * 1000);
  if (str.endsWith('s') || /^\d+(\.\d+)?$/.test(str)) return Math.round(num * 1000);
  throw new Error(
    `Invalid timeout "${value}": expected a duration like 10h, 10m, 3600, or 3600s`
  );
}
