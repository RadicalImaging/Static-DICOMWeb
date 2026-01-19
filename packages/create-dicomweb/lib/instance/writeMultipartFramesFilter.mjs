import fs from 'fs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

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
 * @param {FileDicomWebWriter} options.writer - Optional writer instance. If provided, this writer will be used instead of creating a new one
 * @returns {Object} Filter object with addTag and value methods
 */
export function writeMultipartFramesFilter(options = {}) {
  const { dicomdir, writer: providedWriter } = options;

  // If no writer is provided, dicomdir is required for creating one
  if (!providedWriter && !dicomdir) {
    throw new Error('Either writer or dicomdir option is required for writeMultipartFramesFilter');
  }

  // Use the provided writer or create one lazily
  let writer = providedWriter || null;
  
  // Track frame number per pixel data tag (increments for each value() call)
  let currentFrameNumber = 0;

  /**
   * Gets or creates the writer, using the listener's information
   * @param {Object} listener - The DicomMetadataListener instance (accessed via 'this')
   * @returns {FileDicomWebWriter}
   */
  function getWriter(listener) {
    if (!writer && listener.information) {
      // Use the listener's information object directly (camelCase from createInformationFilter)
      writer = new FileDicomWebWriter(listener.information, { baseDir: dicomdir });
    }
    return writer;
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

    console.log('Filter value() called:', { currentTag, level, isPixelData: currentTag === TAGS.PixelData });

    // Only process pixel data at the top level (level <2) and only for pixel data tag
    if (currentTag === TAGS.PixelData && level < 2) {
      console.log('Processing pixel data frame');
      
      // Get the writer (creates it if needed using the listener's information)
      const frameWriter = getWriter(this);
      if (!frameWriter) {
        console.warn('Writer not available, information not yet populated');
        return next(v);
      }
      
      // Increment frame number for this call (each value() call = one frame)
      currentFrameNumber++;
      const frameNumber = currentFrameNumber;

      const frame = Array.isArray(v) ? v : [v];
      console.log('Frame data:', { frameNumber, isArray: Array.isArray(v), elementCount: frame.length });
      
      // Array means all elements together form ONE frame - write incrementally
      const setup = frameWriter.prepareFrameSetup(this, frameNumber, dicomdir);
      console.log('Setup result:', setup ? 'success' : 'failed');
      if (!setup) {
        return next(undefined);
      }

      // Ensure output directory exists synchronously (needed before stream writes)
      if (!fs.existsSync(setup.outputDir)) {
        fs.mkdirSync(setup.outputDir, { recursive: true });
      }

      // Start incremental frame write immediately
      frameWriter.startIncrementalFrame(
        frameNumber,
        setup.filename,
        setup.contentTypeHeader,
        setup.boundary,
        setup.outputDir,
        setup.needsGzip
      );

      // Write each array element incrementally (don't concatenate into single buffer)
      // Each element is written immediately to avoid large buffers in memory
      for (const element of frame) {
        if (element instanceof ArrayBuffer) {
          const buffer = Buffer.from(element);
          frameWriter.writeIncrementalBuffer(buffer, frameNumber);
        }
      }

      // Finalize the frame after all elements are written
      frameWriter.finalizeIncrementalFrame(frameNumber).catch(error => {
        console.error(`Error finalizing frame ${frameNumber}:`, error);
        frameWriter.activeStreams.delete(frameNumber);
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
