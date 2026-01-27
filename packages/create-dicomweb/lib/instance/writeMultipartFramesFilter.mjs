import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';
import { createFrameWriter } from './streamWriters.mjs';

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

    // Only process pixel data at the top level (level <2) and only for pixel data tag
    if (currentTag === TAGS.PixelData && level < 2) {
      // Get the writer (creates it if needed using the listener's information)
      const frameWriter = getWriter(this);
      if (!frameWriter) {
        console.warn('Writer not available, information not yet populated');
        return next(v);
      }
      
      // Increment frame number for this call (each value() call = one frame)
      currentFrameNumber++;
      const frameNumber = currentFrameNumber;

      // Create a writer function bound with the frame data
      const frameDataWriter = createFrameWriter(v);
      
      // Use writeToStream to handle writing, closing, and error handling
      // This ensures proper cleanup in all cases (errors are handled and streams are cleaned up)
      // Errors are recorded internally and the promise resolves (doesn't throw)
      // writeToStream now handles all promise rejections internally to prevent process termination
      streamInfo.write(v);
      
      // Return relative path string as URI format (synchronously)
      const relativePath = `frames/${frameNumber}.mht`;
      return next(relativePath);
    }

    // For non-pixel-data or non-top-level, pass through the original value
    return next(v);
  }

  /**
   * Filter method: Called when a tag is being closed (popped from stack)
   * Replaces the pixel data Value with a BulkDataURI reference
   */
  function pop(next, result) {
    // Access the current tag context
    const current = this.current;
    const currentTag = current?.tag;
    const level = current?.level ?? 0;
    const dest = current?.dest;

    // If we're closing a PixelData tag at the top level, modify the dest object
    if (currentTag === TAGS.PixelData && level === 0 && dest) {
      // Delete the Value property and add BulkDataURI
      delete dest.Value;
      dest.BulkDataURI = './frames';
    }

    // Always call next with the result
    return next(result);
  }
  
  return {
    addTag,
    value,
    pop,
    getWriter: () => writer,
  };
}
