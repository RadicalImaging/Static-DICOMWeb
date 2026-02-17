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
 * Writes one full frame to a new frame stream (Pattern A: frame supplied in its entirety in value).
 * Opens the stream, writes the data (Buffer/ArrayBuffer/array of same), then closes the stream.
 *
 * @param {FileDicomWebWriter} frameWriter - The writer instance
 * @param {number} frameNumber - 1-based frame index
 * @param {ArrayBuffer|Buffer|Array<ArrayBuffer|Buffer>} v - Frame data (single buffer or array of fragments)
 * @returns {string} - Relative path to the written frame file (e.g. 'frames/1.mht')
 */
function writeFullFrame(frameWriter, frameNumber, v) {
  const streamKey = `frame:${frameNumber}`;
  const streamInfo = frameWriter.openFrameStream(frameNumber, { streamKey });
  streamInfo.write(v);
  frameWriter.closeStream(streamKey);
  return `frames/${frameNumber}.mht`;
}

/**
 * Filter for DicomMetadataListener that writes binary data to multipart/related .mht files
 *
 * Two writing patterns are supported:
 * - Pattern A: Each frame is supplied in its entirety inside the value() method (one value call = one frame).
 * - Pattern B: startObject([]) is called for each frame, value() is called for each fragment within that frame, and pop() is called between frames.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.dicomdir - Base directory path where .mht files will be written
 * @param {FileDicomWebWriter} options.writer - Optional writer instance. If provided, this writer will be used instead of creating a new one
 * @returns {Object} Filter object with addTag, startObject, value, and pop methods
 */
export function writeMultipartFramesFilter(options = {}) {
  const { dicomdir, writer: providedWriter } = options;

  // If no writer is provided, dicomdir is required for creating one
  if (!providedWriter && !dicomdir) {
    throw new Error('Either writer or dicomdir option is required for writeMultipartFramesFilter');
  }

  // Use the provided writer or create one lazily
  let writer = providedWriter || null;

  // Track frame number per pixel data tag (increments for each frame)
  let currentFrameNumber = null;

  // Pattern B: we are inside a PixelData frame array (startObject([]) was called under PixelData)
  /** @type {import('./StreamInfo.mjs').StreamInfo | null} */
  let pixelDataStreamInfo = null;

  /**
   * Gets or creates the writer, using the listener's information
   * @param {Object} listener - The DicomMetadataListener instance (accessed via 'this')
   * @returns {FileDicomWebWriter | null}
   */
  function getWriter(listener) {
    if (!writer && listener.information) {
      writer = new FileDicomWebWriter(listener.information, { baseDir: dicomdir });
    }
    return writer;
  }

  /**
   * Filter method: Called when a tag is added
   */
  function addTag(next, tag, tagInfo) {
    if (tag === TAGS.PixelData && this.current?.level === 0) {
      console.verbose(
        '[frames filter] PixelData tag arrived. information:',
        this.information,
        tagInfo?.length
      );

      currentFrameNumber = 0;
      pixelDataStreamInfo = null;
    } else {
      currentFrameNumber = null;
    }
    return next(tag, tagInfo);
  }

  const UIDS_REQUIRED_MSG =
    "StudyInstanceUID, SeriesInstanceUID, and SOPInstanceUID are required to write frame data; ensure the writer's information provider is populated before PixelData is processed.";

  /**
   * Throws if the writer does not have the UIDs required to open frame streams.
   * @param {FileDicomWebWriter} w
   * @throws {Error} when any required UID is missing
   */
  function assertRequiredUIDs(w) {
    const studyUID = w?.getStudyUID?.();
    const seriesUID = w?.getSeriesUID?.();
    const sopUID = w?.getSOPInstanceUID?.();
    if (!studyUID || !seriesUID || !sopUID) {
      console.error(
        `[writeMultipartFramesFilter] Missing UIDs: study=${studyUID || 'MISSING'}, series=${seriesUID || 'MISSING'}, sop=${sopUID || 'MISSING'}`
      );
      throw new Error(UIDS_REQUIRED_MSG);
    }
  }

  /**
   * Filter method: Called when starting a new object (e.g. array for a frame).
   * Pattern B: When we see startObject([]) under PixelData, open a frame stream and track it.
   */
  function startObject(next, dest) {
    if (currentFrameNumber === null) {
      return next(dest);
    }
    const current = this.current;

    const frameWriter = getWriter(this);
    if (frameWriter) {
      try {
        assertRequiredUIDs(frameWriter);
      } catch {
        // UIDs not available – fall back to inline data
        currentFrameNumber = null;
        return next(dest);
      }
      currentFrameNumber++;
      const frameNumber = currentFrameNumber;
      const streamKey = `frame:${frameNumber}`;
      pixelDataStreamInfo = frameWriter.openFrameStream(frameNumber, { streamKey });
    }

    return next(dest);
  }

  /**
   * Filter method: Called when a value is added.
   * - Pattern A: PixelData at level < 2, not inside frame array — v is one full frame; write it and return path.
   * - Pattern B: Inside frame array — v is a fragment; write to current frame stream and pass through.
   */
  function value(next, v) {
    if (currentFrameNumber === null) {
      return next(v);
    }
    const current = this.current;
    const currentTag = current?.tag;
    const level = current?.level ?? 0;

    // Pattern B: streaming frames — we're inside startObject([]) for this frame, each value is a fragment
    if (pixelDataStreamInfo) {
      pixelDataStreamInfo.write(v);
      return next(v);
    }

    // Pattern A: each value() is one complete frame at PixelData, level < 2
    const frameWriter = getWriter(this);
    if (!frameWriter) {
      return next(v);
    }
    try {
      assertRequiredUIDs(frameWriter);
    } catch {
      // UIDs not available – fall back to inline data
      currentFrameNumber = null;
      return next(v);
    }
    currentFrameNumber++;
    const frameNumber = currentFrameNumber;
    const relativePath = writeFullFrame(frameWriter, frameNumber, v);
    return next(frameNumber);
  }

  /**
   * Filter method: Called when a tag or object is being closed (popped from stack).
   * - Pattern B: When popping the frame array, end and close the current frame stream.
   * - When closing the PixelData tag, replace Value with BulkDataURI.
   */
  function pop(next, result) {
    if (currentFrameNumber === null) {
      return next(result);
    }
    const current = this.current;
    const currentTag = current?.tag;
    const level = current?.level ?? 0;
    const dest = current?.dest;

    // Pattern B: ending the frame array — close the frame stream we opened in startObject
    if (pixelDataStreamInfo) {
      const streamKey = pixelDataStreamInfo.streamKey;
      const frameWriter = getWriter(this);
      pixelDataStreamInfo = null;
      if (frameWriter) {
        frameWriter.closeStream(streamKey).catch(err => {
          console.error(`Error closing frame stream ${streamKey}:`, err);
          frameWriter.recordStreamError(streamKey, err, true);
        });
      }
    } else {
      // If we're closing the PixelData tag at the top level, replace Value with BulkDataURI
      delete dest.Value;
      dest.BulkDataURI = './frames';
      currentFrameNumber = null;
    }

    return next(result);
  }

  return {
    addTag,
    startObject,
    value,
    pop,
    getWriter: () => writer,
  };
}
