import fs from 'fs';

/**
 * Old code created metadata as a directory (with index.json.gz inside)
 * instead of as a metadata.gz file. These helpers safely clean those up.
 * Only operates on paths ending with /metadata or /metadata.gz.
 */
const METADATA_PATH_RE = /[/\\]metadata(\.gz)?$/;

/**
 * Removes a stale metadata directory at the given path (sync).
 * Returns true if a directory was found and removed, false otherwise.
 * Safe: refuses to operate on non-metadata paths.
 */
export function removeStaleMetadataDirSync(filePath) {
  if (!METADATA_PATH_RE.test(filePath)) return false;
  try {
    if (!fs.statSync(filePath).isDirectory()) return false;
  } catch {
    return false;
  }
  fs.rmSync(filePath, { recursive: true, force: true });
  return true;
}

/**
 * Removes a stale metadata directory at the given path (async).
 * Returns true if a directory was found and removed, false otherwise.
 * Safe: refuses to operate on non-metadata paths.
 */
export async function removeStaleMetadataDir(filePath) {
  if (!METADATA_PATH_RE.test(filePath)) return false;
  try {
    if (!(await fs.promises.stat(filePath)).isDirectory()) return false;
  } catch {
    return false;
  }
  await fs.promises.rm(filePath, { recursive: true, force: true });
  return true;
}
