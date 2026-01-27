import { Writable } from 'stream';

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
    this.parentStream.on('error', (error) => {
      this.destroy(error);
    });
  }

  /**
   * Writes the multipart header on first write
   * @private
   */
  _writeHeader() {
    if (this.headerWritten) return;
    
    const headerLines = [
      `--${this.boundary}\r\n`,
      `Content-Type: ${this.contentType}\r\n`,
      `Content-Location: ${this.contentLocation}\r\n`,
      `\r\n`,
    ].join('');
    
    this.parentStream.write(headerLines, 'utf-8');
    this.headerWritten = true;
  }

  /**
   * Writes the multipart footer
   * @private
   */
  _writeFooter() {
    if (this.footerWritten) return;
    
    const footer = `\r\n--${this.boundary}--\r\n`;
    this.parentStream.write(footer, 'utf-8');
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
