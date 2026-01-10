import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { createGzip } from 'zlib';
import { v4 as uuid } from 'uuid';
import { uids } from '@radicalimaging/static-wado-creator';

const fsPromises = fs.promises;

/**
 * DICOM tag hex values for UIDs and Transfer Syntax
 */
const TAGS = {
  StudyInstanceUID: '0020000D',
  SeriesInstanceUID: '0020000E',
  SOPInstanceUID: '00080018',
  TransferSyntaxUID: '00020010',
  PixelData: '7FE00010',
};

/**
 * Filter for DicomMetadataListener that writes binary data to multipart/related .mht files
 *
 * @param {Object} options - Configuration options
 * @param {string} options.dicomdir - Base directory path where .mht files will be written
 * @returns {Object} Filter object with addTag and value methods
 */
export function writeMultipartFramesFilter(options = {}) {
  const { dicomdir } = options;

  if (!dicomdir) {
    throw new Error('dicomdir option is required for writeBinaryMultipartFilter');
  }

  // Track frame number per pixel data tag (increments for each value() call)
  let currentFrameNumber = 0;
  // Track active write streams for frames that are being written incrementally (array case)
  const activeStreams = new Map(); // frameNumber -> { stream, fileStream, boundary, contentTypeHeader, filename }


  /**
   * Starts writing a frame incrementally (for array case where elements arrive separately)
   * @param {number} frameNumber - The frame number (1-based)
   * @param {string} filename - The filename for this frame
   * @param {string} contentTypeHeader - The Content-Type header with transfer-syntax
   * @param {string} boundary - The multipart boundary
   * @param {string} outputDir - The output directory
   * @param {boolean} needsGzip - Whether to gzip the output file
   * @returns {Object} - Stream info object
   */
  function startIncrementalFrame(frameNumber, filename, contentTypeHeader, boundary, outputDir, needsGzip) {
    const filepath = path.join(outputDir, filename);
    const fileWriteStream = fs.createWriteStream(filepath);

    // Create the stream to write to: gzip stream if compressing, otherwise file stream directly
    let stream;
    if (needsGzip) {
      const gzipStream = createGzip();
      gzipStream.pipe(fileWriteStream);
      // Forward errors from gzip stream to file write stream
      gzipStream.on('error', (error) => {
        fileWriteStream.destroy(error);
      });
      stream = gzipStream;
    } else {
      stream = fileWriteStream;
    }

    // Write header to stream (always write to stream, whether gzip or not)
    const headerLines = [
      `--${boundary}\r\n`,
      `Content-Type: ${contentTypeHeader}\r\n`,
      `Content-Location: ${filename}\r\n`,
      `\r\n`,
    ].join('');
    
    stream.write(headerLines, 'utf-8');

    return { stream, fileStream: fileWriteStream, boundary, contentTypeHeader, filename };
  }

  /**
   * Writes a buffer incrementally to an active frame stream
   * @param {Buffer} buffer - The buffer to write
   * @param {number} frameNumber - The frame number
   */
  function writeIncrementalBuffer(buffer, frameNumber) {
    const streamInfo = activeStreams.get(frameNumber);
    if (streamInfo) {
      // Always write to stream (which is either gzip stream or file stream)
      streamInfo.stream.write(buffer);
    }
  }

  /**
   * Finalizes an incremental frame write
   * @param {number} frameNumber - The frame number
   * @returns {Promise<string>} - Relative path string
   */
  async function finalizeIncrementalFrame(frameNumber) {
    const streamInfo = activeStreams.get(frameNumber);
    if (!streamInfo) {
      return undefined;
    }

    // Write footer to stream (always write to stream, whether gzip or not)
    const footer = `\r\n--${streamInfo.boundary}--\r\n`;
    streamInfo.stream.write(footer, 'utf-8');
    streamInfo.stream.end();

    // Wait for the file stream to finish
    // When gzipping: ending stream (gzip) -> gzip processes and pipes to fileStream -> fileStream finishes
    // When not gzipping: ending stream (fileStream) -> fileStream finishes directly
    // Always listen to fileStream.on('finish') since it's the actual destination
    return new Promise((resolve, reject) => {
      const fileStream = streamInfo.fileStream;
      
      fileStream.on('finish', () => {
        activeStreams.delete(frameNumber);
        // Return relative path as URI format: frames/<frameNumber>.mht or frames/<frameNumber>.mht.gz
        const relativePath = `frames/${streamInfo.filename}`;
        resolve(relativePath);
      });
      
      fileStream.on('error', reject);
      // Also listen to stream errors (gzip stream if present, or file stream)
      streamInfo.stream.on('error', reject);
    });
  }

  /**
   * Prepares frame writing setup (gets UIDs, creates directory, etc.)
   * @param {Object} listener - The DicomMetadataListener instance
   * @param {number} frameNumber - The frame number
   * @returns {Object|null} - Setup info or null if UIDs missing
   */
  function prepareFrameSetup(listener, frameNumber) {
    // Get UIDs using the helper methods from the listener
    const studyUID = listener.getStudyInstanceUID();
    const seriesUID = listener.getSeriesInstanceUID();
    const sopUID = listener.getSOPInstanceUID();

    // Validate that we have all required UIDs
    if (!studyUID || !seriesUID || !sopUID) {
      console.warn('Missing required UIDs for binary write, skipping:', {
        studyUID,
        seriesUID,
        sopUID,
      });
      return null;
    }

    // Get transfer syntax from FMI using the helper method
    const tsUID = listener.getTransferSyntaxUID();

    // Build the output path
    const outputDir = path.join(
      dicomdir,
      'studies',
      studyUID,
      'series',
      seriesUID,
      'instances',
      sopUID,
      'frames'
    );

    // Determine content type based on transfer syntax UID
    const type = tsUID ? uids[tsUID] || uids.default || {} : {};
    const contentType = type.contentType || 'application/octet-stream';

    // Check if transfer syntax is uncompressed (needs gzip)
    const needsGzip = type.uncompressed === true || type.gzip === true;

    // Generate filename: <frameNumber>.mht or <frameNumber>.mht.gz based on compression
    const filename = needsGzip ? `${frameNumber}.mht.gz` : `${frameNumber}.mht`;

    // Generate boundary ID
    const boundaryId = uuid();
    const boundary = `BOUNDARY_${boundaryId}`;

    // Build Content-Type header with transfer-syntax attribute if available
    let contentTypeHeader = contentType;
    if (tsUID) {
      contentTypeHeader = `${contentType};transfer-syntax=${tsUID}`;
    }

    return { outputDir, filename, boundary, contentTypeHeader, needsGzip };
  }

  /**
   * Filter method: Called when a tag is added
   */
  function addTag(next, tag, tagInfo) {
    // Reset frame number when starting a new pixel data tag
    if (tag === TAGS.PixelData) {
      currentFrameNumber = 0;
    }
    return next(tag, tagInfo);
  }

  /**
   * Filter method: Called when a value is added
   * Each call to value() represents one complete frame
   */
  function value(next, v) {
    // Access tag, vr, and level from this.current (now stored in the current object)
    const current = this.current;
    const currentTag = current?.tag;
    const currentVR = current?.vr;
    const level = current?.level ?? 0;

    // Only process pixel data at the top level (level <2) and only for pixel data tag
    if (currentTag === TAGS.PixelData && level < 2) {
      // Increment frame number for this call (each value() call = one frame)
      currentFrameNumber++;
      const frameNumber = currentFrameNumber;

      const frame = Array.isArray(v) ? v : [v];
      // Array means all elements together form ONE frame - write incrementally
      const setup = prepareFrameSetup(this, frameNumber);
      if (!setup) {
        return next(undefined);
      }

      // Ensure output directory exists synchronously (needed before stream writes)
      if (!fs.existsSync(setup.outputDir)) {
        fs.mkdirSync(setup.outputDir, { recursive: true });
      }

      // Start incremental frame write immediately
      const streamInfo = startIncrementalFrame(
        frameNumber,
        setup.filename,
        setup.contentTypeHeader,
        setup.boundary,
        setup.outputDir,
        setup.needsGzip
      );
      activeStreams.set(frameNumber, streamInfo);

      // Write each array element incrementally (don't concatenate into single buffer)
      // Each element is written immediately to avoid large buffers in memory
      for (const element of frame) {
        if (element instanceof ArrayBuffer) {
          const buffer = Buffer.from(element);
          writeIncrementalBuffer(buffer, frameNumber);
        }
      }

      // Finalize the frame after all elements are written
      finalizeIncrementalFrame(frameNumber).catch(error => {
        console.error(`Error finalizing frame ${frameNumber}:`, error);
        activeStreams.delete(frameNumber);
      });

      // Return relative path string as URI format: frames/<frameNumber>.mht or frames/<frameNumber>.mht.gz
      const relativePath = `frames/${setup.filename}`;
      return next(relativePath);
    }

    // For non-pixel-data or non-top-level, pass through the original value
    return next(v);
  }

  return {
    addTag,
    value,
  };
}
