import { createReadStream, promises as fsp } from 'fs';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import zlib from 'zlib';
import { handleHomeRelative, readBulkData } from '@radicalimaging/static-wado-util';

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
 * Resolves when res can take more data, or when it closes.
 * @param {import('http').ServerResponse} res
 * @returns {Promise<void>}
 */
function drainedOrClosed(res) {
  return new Promise(resolve => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.on('drain', done);
    res.on('close', done);
  });
}

/**
 * Streams the stages into res and ends it. Unlike pipeline(..., res), a failure does
 * not destroy res: while no headers are sent, the caller can still send a different
 * response, such as the generated Part 10 data.
 * @param {import('http').ServerResponse} res - Response to write to
 * @param {import('stream').Duplex[]} stages - Source first, response bytes last
 * @returns {Promise<void>}
 */
async function streamToResponse(res, stages) {
  await pipeline(...stages, async source => {
    for await (const chunk of source) {
      if (res.destroyed) return;
      if (!res.write(chunk)) await drainedOrClosed(res);
    }
  });
  res.end();
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
 * exists. The response always carries the boundary of the stored wrapper, because a
 * multipart/related body cannot be parsed without it. For multipart/related, a client
 * that accepts gzip gets the stored file through dicomMap and the static controllers,
 * and any other client gets the decompressed wrapper. The other accept types stream
 * the payload out of the wrapper. Only when no stored file exists, or it is not a
 * usable multipart wrapper, or reading it fails before any byte is sent, is the Part 10
 * data re-created from metadata and bulkdata.
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

    const storedPath = await findStoredRendition(baseDir, req.staticWadoPath ?? req.path);
    const boundary = storedPath ? await readStoredBoundary(storedPath) : null;
    if (storedPath && !boundary) {
      console.warn(`Stored Part 10 file ${storedPath} is not a multipart wrapper`);
    }
    if (storedPath && boundary) {
      try {
        if (acceptType === 'multipart/related') {
          res.setHeader(
            'Content-Type',
            `multipart/related; type="application/dicom"; boundary="${boundary}"`
          );
          // dicomMap keeps this Content-Type, and the static controllers send the .gz as is
          if (storedPath.endsWith('.gz') && req.acceptsEncodings?.('gzip')) return next();
          await streamToResponse(res, storedRenditionStages(storedPath));
          return;
        }
        if (acceptType === 'application/dicom') {
          res.setHeader('Content-Type', 'application/dicom');
          res.setHeader('Content-Disposition', `attachment; filename="${instanceUID}.dcm"`);
          await streamToResponse(res, [
            ...storedRenditionStages(storedPath),
            createPayloadTransform(boundary),
          ]);
          return;
        }
        if (acceptType === 'application/zip') {
          const stored = await readBulkData(path.dirname(storedPath), 'index.mht');
          if (stored) {
            const AdmZip = (await import('adm-zip')).default;
            const zip = new AdmZip();
            zip.addFile(`${instanceUID}.dcm`, Buffer.from(stored.binaryData));
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${studyUID}.zip"`);
            res.send(zip.toBuffer());
            return;
          }
        }
      } catch (error) {
        console.warn(`Unable to serve stored Part 10 file ${storedPath}: ${error.message}`);
        // Generated data cannot follow a partial body
        if (res.headersSent || res.destroyed) {
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
