import { randomUUID } from 'crypto';
import { Writable } from 'stream';

const CRLF = Buffer.from('\r\n');

/** The delimiter line and the headers of one part, up to and with the empty line */
function partHeader(boundary, contentType, contentLocation, transferSyntaxUid) {
  const type = transferSyntaxUid
    ? `${contentType}; transfer-syntax=${transferSyntaxUid}`
    : contentType;
  const location = contentLocation ? `Content-Location: ${contentLocation}\r\n` : '';
  return `--${boundary}\r\nContent-Type: ${type}\r\n${location}\r\n`;
}

/** The close delimiter that ends a multipart body */
const closeDelimiter = boundary => `\r\n--${boundary}--\r\n`;

/**
 * Wraps parts in a multipart/related body, in the form that the stored frames and bulkdata
 * have.
 * @param {{body: Buffer|Uint8Array, contentType: string, transferSyntaxUid?: string,
 *   contentLocation?: string}[]} parts
 * @param {string} [boundary]
 * @returns {{body: Buffer, contentType: string}} The body, and the `multipart/related`
 *   content type with the `type` of the first part and the boundary
 */
export function wrapMultipart(parts, boundary = `BOUNDARY_${randomUUID()}`) {
  const chunks = parts.flatMap((part, index) => [
    Buffer.from(
      (index ? '\r\n' : '') +
        partHeader(boundary, part.contentType, part.contentLocation, part.transferSyntaxUid)
    ),
    part.body,
  ]);
  chunks.push(Buffer.from(closeDelimiter(boundary)));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/related; type="${parts[0].contentType}"; boundary=${boundary}`,
  };
}

/** Content type (without parameters) and transfer syntax of the headers of one part */
function parsePartHeaders(headers) {
  let contentType = 'application/octet-stream';
  let transferSyntaxUid = null;
  for (const line of headers.split('\r\n')) {
    if (!/^content-type:/i.test(line)) continue;
    const semi = line.indexOf(';');
    contentType = line.substring(13, semi !== -1 ? semi : undefined).trim();
    const tsMatch = /transfer-syntax=\s*"?([^;"\s]+)/i.exec(line);
    if (tsMatch) transferSyntaxUid = tsMatch[1];
  }
  return { contentType, transferSyntaxUid };
}

/**
 * Splits a multipart/related body into its parts. The boundary is the first line of the
 * body. A body with no close delimiter ends its last part at the end of the data.
 * @param {Buffer|Uint8Array} input
 * @returns {{body: Buffer, contentType: string, transferSyntaxUid: string|null}[]|null}
 *   The parts (bodies are views of the input), or null when the input is not multipart
 */
export function unwrapMultipart(input) {
  let data = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  // Some servers send a CRLF before the first delimiter
  if (data[0] === 0x0d && data[1] === 0x0a) data = data.subarray(2);
  if (data[0] !== 0x2d || data[1] !== 0x2d) return null;
  const lineEnd = data.indexOf(CRLF);
  if (lineEnd === -1) return null;
  const delimiter = Buffer.concat([CRLF, data.subarray(0, lineEnd)]);

  const parts = [];
  let start = lineEnd;
  while (true) {
    const headerEnd = data.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const bodyStart = headerEnd + 4;
    const next = data.indexOf(delimiter, bodyStart);
    parts.push({
      ...parsePartHeaders(data.toString('utf-8', start, headerEnd)),
      body: data.subarray(bodyStart, next === -1 ? data.length : next),
    });
    // "--" after the delimiter closes the body
    if (next === -1 || data[next + delimiter.length] === 0x2d) break;
    start = next + delimiter.length;
  }
  return parts;
}

/**
 * A stream wrapper that adds multipart/related headers and footers
 * Wraps a parent stream and adds MIME multipart formatting
 */
export class MultipartStreamWriter extends Writable {
  /**
   * @param {Object} parentStream - The stream to write multipart data to
   * @param {Object} options - Multipart options
   * @param {string} options.boundary - The multipart boundary
   * @param {string} options.contentType - The content type for the part
   * @param {string} options.contentLocation - The content location (filename)
   */
  constructor(parentStream, options = {}) {
    super();

    this.parentStream = parentStream;
    this.boundary = options.boundary;
    this.contentType = options.contentType;
    this.contentLocation = options.contentLocation;
    this.headerWritten = false;
    this.footerWritten = false;

    // Forward errors from parent stream
    this.parentStream.on('error', error => {
      this.destroy(error);
    });
  }

  /**
   * Writes the multipart header on first write
   * @private
   */
  _writeHeader() {
    if (this.headerWritten) return;
    this.parentStream.write(
      partHeader(this.boundary, this.contentType, this.contentLocation),
      'utf-8'
    );
    this.headerWritten = true;
  }

  /**
   * Writes the multipart footer
   * @private
   */
  _writeFooter() {
    if (this.footerWritten) return;
    this.parentStream.write(closeDelimiter(this.boundary), 'utf-8');
    this.footerWritten = true;
  }

  /**
   * Implements the writable stream _write method
   * @param {Buffer|string} chunk - The data to write
   * @param {string} encoding - The encoding (if chunk is string)
   * @param {Function} callback - Callback when write is complete
   * @private
   */
  _write(chunk, encoding, callback) {
    // Write header on first write
    if (!this.headerWritten) {
      this._writeHeader();
    }

    // Write the actual data to parent stream
    this.parentStream.write(chunk, encoding, callback);
  }

  /**
   * Implements the writable stream _final method
   * Called when the stream is ending
   * @param {Function} callback - Callback when finalization is complete
   * @private
   */
  _final(callback) {
    // Write footer before ending
    this._writeFooter();

    // End the parent stream
    if (this.parentStream && typeof this.parentStream.end === 'function') {
      this.parentStream.end(callback);
    } else {
      callback();
    }
  }
}
