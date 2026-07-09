import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';

const MULTIPART_BOUNDARY = '----DICOMwebBoundary';

/**
 * Locates the already-stored Part 10 rendition for an instance:
 * instances/<sopUID>/index.mht.gz (or index.mht), as written by STOW /
 * mkdicomweb or retrieved by deploydicomweb.
 * @param {string} baseDir - DICOMweb root directory
 * @param {string} staticWadoPath - Request path (hash-mapped when applicable)
 * @returns {string|null} - Full path of the stored file, or null
 */
function findStoredRendition(baseDir, staticWadoPath) {
  if (!staticWadoPath) return null;
  const instanceDir = path.join(baseDir, ...staticWadoPath.split('/').filter(Boolean));
  for (const name of ['index.mht.gz', 'index.mht']) {
    const filePath = path.join(instanceDir, name);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

/**
 * Reads a stored index.mht/index.mht.gz file and extracts the raw Part 10
 * payload from its multipart/related wrapper.
 * @param {string} filePath - Path to the stored file
 * @returns {Buffer|null} - Raw Part 10 bytes, or null if not multipart
 */
function readStoredPart10(filePath) {
  let data = fs.readFileSync(filePath);
  if (filePath.endsWith('.gz')) {
    data = zlib.gunzipSync(data);
  }
  // Expect a multipart wrapper: --<boundary>\r\n<headers>\r\n\r\n<payload>\r\n--<boundary>--
  if (data.length < 4 || data[0] !== 0x2d || data[1] !== 0x2d) return null;
  const firstLineEnd = data.indexOf('\r\n');
  if (firstLineEnd === -1) return null;
  const boundary = data.subarray(2, firstLineEnd).toString('latin1').trim();
  const headerEnd = data.indexOf('\r\n\r\n', firstLineEnd);
  if (headerEnd === -1) return null;
  const payloadStart = headerEnd + 4;
  const trailer = Buffer.from(`\r\n--${boundary}--`);
  let payloadEnd = data.lastIndexOf(trailer);
  if (payloadEnd < payloadStart) payloadEnd = data.length;
  return data.subarray(payloadStart, payloadEnd);
}

/**
 * Checks whether a value explicitly requests Part 10 multipart/related
 * (i.e. type="application/dicom"), as opposed to standard WADO-RS
 * multipart/related which uses type="application/octet-stream" or no type.
 * @param {string} value - Accept header or query value
 * @returns {boolean}
 */
function isMultipartDicom(value) {
  if (!value.includes('multipart/related')) return false;
  // Only match when the type parameter is explicitly "application/dicom"
  return /multipart\/related\s*;\s*type\s*=\s*"?application\/dicom"?/i.test(value);
}

/**
 * Determines the requested accept type from query parameter or Accept header.
 * Only returns a Part 10 accept type for requests that explicitly ask for it.
 * Plain multipart/related (standard WADO-RS) falls through to dicomMap.
 * @param {object} req - Express request
 * @returns {string|null} - Normalized accept type, or null to fall through
 */
function getAcceptType(req) {
  // Query parameter takes precedence
  const queryAccept = req.query.accept;
  if (queryAccept) {
    if (queryAccept.includes('application/zip')) {
      return 'application/zip';
    }
    // application/dicom without multipart wrapper
    if (queryAccept.includes('application/dicom') && !queryAccept.includes('multipart')) {
      return 'application/dicom';
    }
    // multipart/related; type="application/dicom" — explicit Part 10 request
    else {
      return 'multipart/related';
    }
  }

  // Fall back to Accept header
  const acceptHeader = req.header('accept') || '';
  if (acceptHeader.includes('application/zip')) {
    return 'application/zip';
  }
  if (acceptHeader.includes('application/dicom') && !acceptHeader.includes('multipart')) {
    return 'application/dicom';
  }

  // No Part 10-specific accept type requested
  return 'multipart/related';
}

/**
 * Factory function returning Express middleware for WADO-RS Part 10 instance retrieval.
 * Supports accept negotiation via query param or Accept header:
 * - application/dicom: raw Part 10 binary
 * - application/zip: zip archive containing Part 10 files
 * - multipart/related: multipart/related wrapping Part 10 binary (default for Part 10 requests)
 *
 * Serves the already-stored rendition (instances/<sopUID>/index.mht.gz) when it
 * exists - for multipart/related by falling through to dicomMap/static serving,
 * otherwise by unwrapping the stored multipart payload. Only when no stored file
 * exists (or it is unreadable) is the Part 10 data re-created from metadata and
 * bulkdata as a backup.
 *
 * If no Part 10-specific accept type is detected, calls next() to fall through
 * to the existing dicomMap handler.
 *
 * @param {object} options - Server options (must include dir)
 * @returns {Function} Express middleware
 */
export default function part10Controller(options) {
  const baseDir = handleHomeRelative(options.dir ?? options.rootDir);

  return async (req, res, next) => {
    const acceptType = getAcceptType(req);

    // If no Part 10 accept type, fall through to existing handlers
    if (!acceptType) {
      return next();
    }

    const { studyUID, seriesUID, instanceUID } = req.params;

    // Prefer the already-stored (compressed) rendition; only re-create as a backup.
    const storedPath = findStoredRendition(baseDir, req.staticWadoPath ?? req.path);
    if (storedPath) {
      if (acceptType === 'multipart/related') {
        if (storedPath.endsWith('.gz')) {
          // Fall through to dicomMap + the static controllers, which serve the
          // stored index.mht.gz directly (gzip-encoded multipart/related).
          return next();
        }
        // Plain index.mht - dicomMap only maps to index.mht.gz, so send directly
        res.setHeader('Content-Type', 'multipart/related; type="application/dicom"');
        res.sendFile(path.resolve(storedPath));
        return;
      }
      try {
        const dcmBuffer = readStoredPart10(storedPath);
        if (dcmBuffer) {
          if (acceptType === 'application/dicom') {
            res.setHeader('Content-Type', 'application/dicom');
            res.setHeader('Content-Disposition', `attachment; filename="${instanceUID}.dcm"`);
            res.send(dcmBuffer);
            return;
          }
          if (acceptType === 'application/zip') {
            const AdmZip = (await import('adm-zip')).default;
            const zip = new AdmZip();
            zip.addFile(`${instanceUID}.dcm`, dcmBuffer);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${studyUID}.zip"`);
            res.send(zip.toBuffer());
            return;
          }
        }
      } catch (error) {
        console.warn(`Unable to serve stored Part 10 file ${storedPath}: ${error.message}`);
      }
      // Stored file unusable for this accept type - fall through to generation
    }

    try {
      // Dynamic import to avoid circular dependency at load time
      const { generatePart10ForStudy } = await import('@radicalimaging/create-dicomweb');

      const sopUids = instanceUID ? [instanceUID] : undefined;
      const { buffers } = await generatePart10ForStudy(baseDir, studyUID, {
        seriesUid: seriesUID,
        sopUids,
      });

      if (!buffers || buffers.length === 0) {
        res.status(404).send('No instances found');
        return;
      }

      if (acceptType === 'application/dicom') {
        // Single raw Part 10 binary (use first result)
        res.setHeader('Content-Type', 'application/dicom');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${buffers[0].sopInstanceUID}.dcm"`
        );
        res.send(buffers[0].buffer);
      } else if (acceptType === 'application/zip') {
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip();

        for (const entry of buffers) {
          zip.addFile(`${entry.sopInstanceUID}.dcm`, entry.buffer);
        }

        const zipBuffer = zip.toBuffer();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${studyUID}.zip"`
        );
        res.send(zipBuffer);
      } else {
        // Default: multipart/related
        const parts = [];
        for (const entry of buffers) {
          parts.push(
            Buffer.from(`--${MULTIPART_BOUNDARY}\r\nContent-Type: application/dicom\r\n\r\n`),
            entry.buffer,
            Buffer.from('\r\n')
          );
        }
        parts.push(Buffer.from(`--${MULTIPART_BOUNDARY}--\r\n`));

        const body = Buffer.concat(parts);
        res.setHeader(
          'Content-Type',
          `multipart/related; type="application/dicom"; boundary="${MULTIPART_BOUNDARY}"`
        );
        res.send(body);
      }
    } catch (error) {
      console.error(`Part 10 generation error: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('No series found')) {
        res.status(404).send(error.message);
      } else {
        res.status(500).send('Internal server error generating Part 10 data');
      }
    }
  };
}
