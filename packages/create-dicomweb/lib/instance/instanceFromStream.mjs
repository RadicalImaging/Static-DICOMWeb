import { async, utilities, data } from 'dcmjs';
import { Tags, StatusMonitor } from '@radicalimaging/static-wado-util';
import { writeMultipartFramesFilter } from './writeMultipartFramesFilter.mjs';
import { writeBulkdataFilter } from './writeBulkdataFilter.mjs';
import { inlineBinaryFilter } from './inlineBinaryFilter.mjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';
import { createPromiseTracker } from 'static-wado-util/lib/createPromiseTracker.mjs';

const { AsyncDicomReader } = async;
const { setValue } = Tags;
const { DicomMetadataListener, createInformationFilter } = utilities;
const { ReadBufferStream } = data;

/**
 * Creates a filter that counts addTag/value calls and reports progress to StatusMonitor.
 * @param {{ typeId: string, jobId: string } | null} statusMonitorJob - Job to update; null to skip reporting
 * @param {number} throttleMs - Min ms between updates
 * @returns {Object} Filter with addTag and value methods
 */
function createProgressFilter(statusMonitorJob, throttleMs) {
  let tagsAdded = 0;
  let valuesAdded = 0;
  let startMs = null;
  let lastReportMs = 0;

  function report(force = false) {
    if (!statusMonitorJob) return;
    const now = Date.now();
    if (!force && now - lastReportMs < throttleMs) return;
    lastReportMs = now;
    const parseProgressMs = startMs != null ? now - startMs : 0;
    StatusMonitor.updateJob(statusMonitorJob.typeId, statusMonitorJob.jobId, {
      parseTagsAdded: tagsAdded,
      parseValuesAdded: valuesAdded,
      parseProgressMs,
      lastBytesReceivedAt: now,
    });
  }

  return {
    addTag(next, tag, tagInfo) {
      if (startMs == null) startMs = Date.now();
      tagsAdded += 1;
      const result = next(tag, tagInfo);
      report();
      return result;
    },
    value(next, v) {
      valuesAdded += 1;
      const result = next(v);
      // Report on every binary value so image and large bulkdata streaming update progress
      const isBinary = v instanceof ArrayBuffer || Buffer.isBuffer(v) || ArrayBuffer.isView(v);
      if (isBinary) report();
      return result;
    },
    reportProgress() {
      report(true);
    },
  };
}

/**
 * Processes a DICOM stream and optionally writes multipart frames
 *
 * @param {Stream|ReadBufferStream} stream - The DICOM stream or ReadBufferStream to process
 * @param {Object} options - Configuration options
 * @param {string} options.dicomdir - Base directory for writing files (required if DicomWebWriter is not provided)
 * @param {Function} options.DicomWebWriter - Constructor for DicomWebWriter. Defaults to FileDicomWebWriter if dicomdir is provided
 * @param {Object} options.writerOptions - Additional options to pass to the DicomWebWriter constructor
 * @param {{ add: (p: Promise) => Promise, limitUnsettled: (max, timeoutMs) => Promise }|undefined} [options.streamWritePromiseTracker] - Optional tracker for stream write promises (e.g. for back pressure). When provided (or via options.writerOptions.streamWritePromiseTracker), the listener drain is set so the reader awaits limitUnsettled before emitting more frame data, preventing too many open streams.
 * @param {number} [options.drainMaxUnsettled=25] - Max unsettled stream writes allowed before reader waits (used when streamWritePromiseTracker is set).
 * @param {number} [options.drainTimeoutMs=5000] - Timeout in ms for drain wait (used when streamWritePromiseTracker is set).
 * @param {boolean} options.bulkdata - Enable bulkdata filter (default: true if writer exists). Set to false to use frames filter instead
 * @param {number} options.sizeBulkdataTags - Size threshold in bytes for public tags (default: 128k + 2 bytes)
 * @param {number} options.sizePrivateBulkdataTags - Size threshold in bytes for private tags (default: 128 bytes)
 * @param {{ typeId: string, jobId: string }} [options.statusMonitorJob] - If set, progress (parseTagsAdded, parseProgressMs) is reported to StatusMonitor.updateJob for this job.
 * @param {number} [options.progressThrottleMs=200] - Min ms between progress updates when statusMonitorJob is set.
 * @returns {Promise<{meta, dict, writer, informationFilter}>} - Parsed metadata and optional writer/filter instances
 */
export async function instanceFromStream(stream, options = {}) {
  const reader = new AsyncDicomReader();

  // Check if the input is a ReadBufferStream instance
  if (stream instanceof ReadBufferStream) {
    // If it's already a ReadBufferStream, use it directly
    // Ensure endOffset is synchronized with the actual buffer size before resetting
    // Check multiple possible sources for the buffer size
    let bufferSize = undefined;
    if (stream.view && stream.view.size !== undefined) {
      bufferSize = stream.view.size;
    } else if (stream.size !== undefined && !isNaN(stream.size)) {
      bufferSize = stream.size;
    } else if (stream.buffer && stream.buffer.length !== undefined) {
      bufferSize = stream.buffer.length;
    }

    // Only set endOffset if we have a valid buffer size
    if (bufferSize !== undefined && !isNaN(bufferSize) && bufferSize >= 0) {
      stream.size = bufferSize;
      stream.endOffset = bufferSize;
    } else {
      // If we don't have a size yet, ensure endOffset is at least set to a valid number
      // The stream might still be receiving data, so we'll let it be set when complete
      if (stream.endOffset === undefined || isNaN(stream.endOffset)) {
        stream.endOffset = stream.startOffset || 0;
      }
    }

    // Ensure startOffset is valid before reset (reset uses startOffset)
    if (stream.startOffset === undefined || isNaN(stream.startOffset)) {
      stream.startOffset = 0;
    }

    // Ensure the stream is reset to start reading from the beginning
    // This sets offset to startOffset, which should be 0 for a fresh stream
    stream.reset();

    // Validate that offset is a valid number after reset
    if (isNaN(stream.offset) || stream.offset < 0) {
      stream.offset = stream.startOffset || 0;
    }

    // Ensure endOffset is still valid after reset
    // Re-check buffer size after reset in case it was updated
    if (stream.view && stream.view.size !== undefined && !isNaN(stream.view.size)) {
      stream.size = stream.view.size;
      stream.endOffset = stream.view.size;
    } else if (stream.endOffset === undefined || isNaN(stream.endOffset)) {
      stream.endOffset = stream.size || stream.startOffset || 0;
    }

    // Final validation: ensure all position properties are valid numbers
    if (isNaN(stream.startOffset)) stream.startOffset = 0;
    if (isNaN(stream.offset)) stream.offset = stream.startOffset;
    if (isNaN(stream.endOffset)) stream.endOffset = stream.size || 0;

    reader.stream = stream;
  } else {
    // Otherwise, treat it as a regular stream and read from it
    await reader.stream.fromAsyncStream(stream);
  }

  // Build filters array
  const information = {};
  const filters = [];

  // Determine which DicomWebWriter to use
  // Default to FileDicomWebWriter if dicomdir is provided but no writer type is specified
  const DicomWebWriterClass =
    options.DicomWebWriter || (options.dicomdir ? FileDicomWebWriter : null);

  // Create writer using the listener's information object
  let writer = null;
  if (DicomWebWriterClass) {
    const writerOptions = { baseDir: options.dicomdir, ...options.writerOptions };
    writer = new DicomWebWriterClass(information, writerOptions);
  }

  // Add bulkdata filter if writer is present (activated by default)
  // Set bulkdata: false to disable and use frames filter instead
  let bulkdataFilter = null;
  const useBulkdata = writer && options.writeBulkdata !== false;

  if (useBulkdata) {
    bulkdataFilter = writeBulkdataFilter({
      dicomdir: options.dicomdir,
      writer,
      sizeBulkdataTags: options.sizeBulkdataTags,
      sizePrivateBulkdataTags: options.sizePrivateBulkdataTags,
    });
    filters.push(bulkdataFilter);
  }

  // Add binary multipart filter only if bulkdata is explicitly disabled
  let frameFilter = null;
  if (writer && options?.writeFrames !== false) {
    frameFilter = writeMultipartFramesFilter({
      dicomdir: options.dicomdir,
      writer,
    });
    filters.push(frameFilter);
  }

  filters.push(inlineBinaryFilter());

  // Progress reporting filter: counts addTag/value and reports to StatusMonitor when statusMonitorJob is set
  const statusMonitorJob = options.statusMonitorJob ?? null;
  const progressThrottleMs = options.progressThrottleMs ?? 200;
  const progressFilter = createProgressFilter(statusMonitorJob, progressThrottleMs);
  filters.unshift(progressFilter);

  // Create listener with filters
  // The listener will automatically create its own information filter and call init()
  const listener = new DicomMetadataListener({ information }, ...filters);

  // Wire drain (backpressure) to the stream write promise tracker so we don't emit
  // frame fragments faster than streams can be consumed (prevents too many open streams).
  const streamWritePromiseTracker =
    options.streamWritePromiseTracker || createPromiseTracker('instanceFromStream');
  if (writer) {
    const drainMaxUnsettled = options.drainMaxUnsettled ?? 25;
    const drainTimeoutMs = options.drainTimeoutMs ?? 5000;
    listener.setDrain(() =>
      streamWritePromiseTracker.limitUnsettled(drainMaxUnsettled, drainTimeoutMs)
    );
  }

  // Final validation of stream state before reading (especially for ReadBufferStream)
  if (reader.stream instanceof ReadBufferStream) {
    // Re-check and update stream properties right before reading
    // The stream might have received more data since initialization
    if (
      reader.stream.view &&
      reader.stream.view.size !== undefined &&
      !isNaN(reader.stream.view.size)
    ) {
      reader.stream.size = reader.stream.view.size;
      reader.stream.endOffset = reader.stream.view.size;
    }
    // Ensure all position properties are valid numbers
    if (isNaN(reader.stream.startOffset)) reader.stream.startOffset = 0;
    if (isNaN(reader.stream.offset)) reader.stream.offset = reader.stream.startOffset;
    if (isNaN(reader.stream.endOffset)) {
      reader.stream.endOffset = reader.stream.size || reader.stream.startOffset || 0;
    }
    // Ensure offset is within valid range
    if (reader.stream.offset < reader.stream.startOffset) {
      reader.stream.offset = reader.stream.startOffset;
    }
    if (reader.stream.offset > reader.stream.endOffset) {
      reader.stream.offset = reader.stream.endOffset;
    }
  }

  const { fmi, dict } = await reader.readFile({ listener });

  progressFilter.reportProgress?.();

  if (dict && reader.meta) {
    const meta = reader.meta;
    const transferSyntax = meta['00020010']?.Value?.[0];
    if (transferSyntax) {
      setValue(dict, Tags.AvailableTransferSyntaxUID, transferSyntax);
    }
  }

  console.noQuiet('Finished parsing file', information.sopInstanceUid);

  if (writer) {
    console.log('Writing metadata to file', information.sopInstanceUid);
    const metadataStream = await writer.openInstanceStream('metadata', { gzip: true });
    metadataStream.stream.write(Buffer.from(JSON.stringify([dict])));
    await writer.closeStream(metadataStream.streamKey);
  }

  // Wait for all frame writes to complete before returning
  await writer?.awaitAllStreams();
  console.log('Finished writing metadata to file', information.sopInstanceUid);

  return { fmi, dict, writer, information: listener.information };
}

/**
 * Wraps instanceFromStream and returns a promise that always resolves to a result object.
 * Never throws: on success returns { ok: true, ...result }; on failure returns { ok: false, error }.
 *
 * @param {Stream|ReadBufferStream} stream - The DICOM stream or ReadBufferStream to process
 * @param {Object} options - Same options as instanceFromStream
 * @returns {Promise<{ok: true, fmi, dict, writer, information}|{ok: false, error: string}>}
 */
export async function instanceFromStreamToResult(stream, options = {}) {
  try {
    const result = await instanceFromStream(stream, options);
    return { ok: true, ...result };
  } catch (err) {
    const errorMessage = err?.message ?? String(err);
    return { ok: false, error: errorMessage };
  }
}
