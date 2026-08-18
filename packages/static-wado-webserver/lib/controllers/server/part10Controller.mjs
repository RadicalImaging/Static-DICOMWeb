import { createReadStream, promises as fsp } from 'fs';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import zlib from 'zlib';
import util from 'util';
import { handleHomeRelative } from '@radicalimaging/static-wado-util';

const gunzip = util.promisify(zlib.gunzip);

const MULTIPART_BOUNDARY = '----DICOMwebBoundary';
const HEADER_END = Buffer.from('\r\n\r\n');
/** Longest part header block accepted before giving up on the wrapper */
const MAX_HEADER_BYTES = 8 * 1024;
/**
 * Bytes held back while streaming a payload so the closing "\r\n--<boundary>--"
 * is always inside the retained tail and never emitted to the client.
 */
const TAIL_BYTES = 1024;

/**
 * Locates the already-stored Part 10 rendition for an instance:
 * instances/<sopUID>/index.mht.gz (or index.mht), as written by STOW /
 * mkdicomweb or retrieved by deploydicomweb.
 * @param {string} baseDir - DICOMweb root directory
 * @param {string} staticWadoPath - Request path (hash-mapped when applicable)
 * @returns {Promise<string|null>} - Full path of the stored file, or null
 */
async function findStoredRendition(baseDir, staticWadoPath) {
  if (!staticWadoPath) return null;
  const instanceDir = path.join(baseDir, ...staticWadoPath.split('/').filter(Boolean));
  for (const name of ['index.mht.gz', 'index.mht']) {
    const filePath = path.join(instanceDir, name);
    try {
      if ((await fsp.stat(filePath)).isFile()) return filePath;
    } catch {
      // Not present, try the next name
    }
  }
  return null;
}

/**
 * The stages that read a stored rendition and decompress it if it is gzipped. They are
 * returned unconnected, so a caller can hand the whole list to pipeline() and have a
 * failure anywhere destroy all of them.
 * @param {string} filePath - Path to the stored file
 * @returns {import('stream').Duplex[]} - Source first, decoded bytes last
 */
function storedRenditionStages(filePath) {
  const source = createReadStream(filePath);
  return filePath.endsWith('.gz') ? [source, zlib.createGunzip()] : [source];
}

/**
 * Reads the multipart boundary from the delimiter line at the start of a stored
 * rendition, decompressing only as far as that line. Also serves as a cheap check
 * that the file really is a multipart wrapper before anything is sent to the client.
 * @param {string} filePath - Path to the stored file
 * @returns {Promise<string|null>} - The boundary, or null if not a multipart file
 */
function readStoredBoundary(filePath) {
  return new Promise(resolve => {
    const stages = storedRenditionStages(filePath);
    const stream = stages.reduce((from, to) => from.pipe(to));
    let text = '';
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      // Only the delimiter line is wanted, so stop reading and release every stage
      for (const stage of stages) stage.destroy();
      resolve(value);
    };
    stream.on('data', chunk => {
      text += chunk.toString('latin1');
      const lineEnd = text.indexOf('\r\n');
      if (lineEnd !== -1) {
        finish(text.startsWith('--') ? text.substring(2, lineEnd).trim() || null : null);
      } else if (text.length > MAX_HEADER_BYTES) {
        finish(null);
      }
    });
    stream.on('error', () => finish(null));
    stream.on('end', () => finish(null));
  });
}

/**
 * Transform that yields the payload of a single-part multipart/related body: it drops
 * the delimiter line and part headers at the front, and the closing boundary at the
 * end. Only the retained tail and the current chunk are held, so arbitrarily large
 * renditions stream without being buffered.
 * @param {string} boundary - Boundary of the wrapper, used to find the closing delimiter
 * @returns {Transform}
 */
function createPayloadTransform(boundary) {
  const trailer = Buffer.from(`\r\n--${boundary}--`);
  let headerDone = false;
  let pending = Buffer.alloc(0);
  let tail = Buffer.alloc(0);

  return new Transform({
    transform(chunk, encoding, callback) {
      let data = chunk;
      if (!headerDone) {
        pending = pending.length ? Buffer.concat([pending, data]) : data;
        const headerEnd = pending.indexOf(HEADER_END);
        if (headerEnd === -1) {
          if (pending.length > MAX_HEADER_BYTES) {
            callback(new Error('Multipart part headers exceed the accepted length'));
            return;
          }
          callback();
          return;
        }
        headerDone = true;
        data = pending.subarray(headerEnd + HEADER_END.length);
        pending = Buffer.alloc(0);
      }

      const buffered = tail.length ? Buffer.concat([tail, data]) : data;
      if (buffered.length <= TAIL_BYTES) {
        // Copy, so a retained view does not pin the whole incoming chunk
        tail = Buffer.from(buffered);
        callback();
        return;
      }
      tail = Buffer.from(buffered.subarray(buffered.length - TAIL_BYTES));
      this.push(buffered.subarray(0, buffered.length - TAIL_BYTES));
      callback();
    },
    flush(callback) {
      if (!headerDone) {
        callback(new Error('Stored rendition is not a multipart wrapper'));
        return;
      }
      const trailerAt = tail.lastIndexOf(trailer);
      this.push(trailerAt === -1 ? tail : tail.subarray(0, trailerAt));
      callback();
    },
  });
}

/**
 * Reads a stored rendition fully and returns the Part 10 payload from its
 * multipart/related wrapper. Used only where the whole buffer is needed anyway
 * (zip), since it holds the compressed file, the decompressed body and the zip
 * output at once; streaming callers use createPayloadTransform instead.
 * @param {string} filePath - Path to the stored file
 * @param {string} boundary - Boundary of the wrapper
 * @returns {Promise<Buffer|null>} - Raw Part 10 bytes, or null if not multipart
 */
async function readStoredPart10(filePath, boundary) {
  let data = await fsp.readFile(filePath);
  if (filePath.endsWith('.gz')) {
    data = await gunzip(data);
  }
  const headerEnd = data.indexOf(HEADER_END);
  if (headerEnd === -1) return null;
  const payloadStart = headerEnd + HEADER_END.length;
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
 * exists - for multipart/related by setting the stored wrapper's boundary and falling
 * through to dicomMap/static serving, otherwise by streaming the payload out of the
 * stored multipart wrapper. Only when no stored file exists (or it is not a usable
 * multipart wrapper) is the Part 10 data re-created from metadata and bulkdata as a
 * backup.
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
    const storedPath = await findStoredRendition(baseDir, req.staticWadoPath ?? req.path);
    // The boundary of the stored wrapper is needed for every accept type: to advertise it
    // in the response header, and to find the closing delimiter when unwrapping. Reading it
    // decompresses only the first line, and a null means the file is not a usable wrapper.
    const boundary = storedPath ? await readStoredBoundary(storedPath) : null;
    if (storedPath && !boundary) {
      console.warn(`Stored Part 10 file ${storedPath} is not a multipart wrapper`);
    }
    if (storedPath && boundary) {
      // A multipart/related body is unparseable without its boundary, so it is always sent.
      const multipartType = `multipart/related; type="application/dicom"; boundary="${boundary}"`;
      if (acceptType === 'multipart/related') {
        res.setHeader('Content-Type', multipartType);
        if (storedPath.endsWith('.gz')) {
          // Fall through to dicomMap + the static controllers, which serve the stored
          // index.mht.gz directly (gzip-encoded multipart/related). dicomMap keeps the
          // Content-Type set here rather than replacing it with its boundary-less default.
          return next();
        }
        // Plain index.mht - dicomMap only maps to index.mht.gz, so send directly
        res.sendFile(path.resolve(storedPath));
        return;
      }
      try {
        if (acceptType === 'application/dicom') {
          // Streamed rather than buffered: a stored SEG can be hundreds of megabytes.
          res.setHeader('Content-Type', 'application/dicom');
          res.setHeader('Content-Disposition', `attachment; filename="${instanceUID}.dcm"`);
          await pipeline(
            ...storedRenditionStages(storedPath),
            createPayloadTransform(boundary),
            res
          );
          return;
        }
        if (acceptType === 'application/zip') {
          const dcmBuffer = await readStoredPart10(storedPath, boundary);
          if (dcmBuffer) {
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
        // Response already started - the client sees a truncated body either way, and
        // falling through would append generated data to it.
        if (res.headersSent) {
          res.destroy(error);
          return;
        }
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
        res.setHeader('Content-Disposition', `attachment; filename="${studyUID}.zip"`);
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
