import { fileURLToPath } from 'url';

/**
 * Recognizes locations that refer to a dicomdir (file-system) DICOMweb root.
 * File locations are: no protocol, file: protocol, or Windows drive-letter paths (e.g. C:\).
 * Non-file protocols (e.g. http:, https:) are not recognized as dicomdir.
 *
 * @param {string} location - URL or path string
 * @returns {boolean} - True if the location is a file/dicomdir location
 */
export function isDicomDirLocation(location) {
  if (typeof location !== 'string' || !location.trim()) {
    return false;
  }
  const s = location.trim();
  const protocolMatch = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!protocolMatch) {
    return true; // no protocol → file path
  }
  const protocol = protocolMatch[1].toLowerCase();
  if (protocol === 'file') {
    return true;
  }
  // Windows drive letter: single letter + colon (e.g. C:\ or C:/)
  if (protocol.length === 1 && /^[a-zA-Z]:[/\\]/.test(s)) {
    return true;
  }
  return false;
}

/**
 * Returns the filesystem path for a dicomdir location, or null if not a file location.
 * Strips file: protocol and normalizes to a path; passes through paths without protocol.
 *
 * @param {string} location - URL or path string
 * @returns {string|null} - Resolved path or null
 */
export function dicomDirPathFromLocation(location) {
  if (!isDicomDirLocation(location)) {
    return null;
  }
  const s = location.trim();
  const protocolMatch = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (protocolMatch) {
    const protocol = protocolMatch[1].toLowerCase();
    if (protocol === 'file') {
      try {
        return fileURLToPath(s);
      } catch {
        return s;
      }
    }
    if (protocol.length === 1 && /^[a-zA-Z]:[/\\]/.test(s)) {
      return s;
    }
  }
  return s;
}
