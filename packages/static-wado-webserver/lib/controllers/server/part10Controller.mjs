import { handleHomeRelative } from '@radicalimaging/static-wado-util';

const MULTIPART_BOUNDARY = '----DICOMwebBoundary';

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
 * If no Part 10-specific accept type is detected, calls next() to fall through
 * to the existing dicomMap handler.
 *
 * @param {object} options - Server options (must include dir)
 * @returns {Function} Express middleware
 */
export default function part10Controller(options) {
  const baseDir = handleHomeRelative(options.dir);

  return async (req, res, next) => {
    const acceptType = getAcceptType(req);

    // If no Part 10 accept type, fall through to existing handlers
    if (!acceptType) {
      return next();
    }

    const { studyUID, seriesUID, instanceUID } = req.params;

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
