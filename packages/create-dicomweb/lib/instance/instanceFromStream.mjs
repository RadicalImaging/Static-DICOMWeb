import { async, utilities, data } from 'dcmjs';
import { v4 as uuid } from 'uuid';
import { Tags, StatusMonitor, createPromiseTracker } from '@radicalimaging/static-wado-util';
import { writeMultipartFramesFilter } from './writeMultipartFramesFilter.mjs';
import { writeBulkdataFilter } from './writeBulkdataFilter.mjs';
import { inlineBinaryFilter } from './inlineBinaryFilter.mjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

const { AsyncDicomReader } = async;
const { setValue } = Tags;
const { DicomMetadataListener, createInformationFilter } = utilities;
const { ReadBufferStream } = data;

/**
 * Returns true if stream is a ReadBufferStream-like object (has reset + addBuffer).
 * Used so that TrackableReadBufferStream (or any buffer stream from another package copy of dcmjs)
 * is treated as a buffer stream and used directly, avoiding fromAsyncStream() which expects
 * an async iterable and would throw "Object is not async iterable".
 * @param {*} stream
 * @returns {boolean}
 */
function isReadBufferStreamLike(stream) {
  return (
    stream &&
    typeof stream.reset === 'function' &&
    typeof stream.addBuffer === 'function'
  );
}

const PARSE_JOB_TYPE = 'stowInstanceParse';

/** Modalities whose original Part 10 binary is stored as instances/<sop>/index.mht.gz */
const RAW_PART10_MODALITIES = new Set(['SEG', 'SR']);
/** SOP Classes whose original Part 10 binary is stored (Basic Structured Display) */
const RAW_PART10_SOP_CLASSES = new Set(['1.2.840.10008.5.1.4.1.1.30']);

/**
 * Returns true when the original Part 10 binary should be stored for this
 * instance (segmentations and structured reports), mirroring the
 * static-wado-creator RawDicomWriter selector.
 * @param {Object} dict - Parsed instance dataset (DICOM JSON model)
 * @returns {boolean}
 */
function shouldStoreRawPart10(dict) {
  const modality = dict?.[Tags.Modality]?.Value?.[0];
  const sopClass = dict?.[Tags.SOPClassUID]?.Value?.[0];
  return RAW_PART10_MODALITIES.has(modality) || RAW_PART10_SOP_CLASSES.has(sopClass);
}

/**
 * Writes the original Part 10 bytes (as received) to the instance-level
 * rendition instances/<sop>/index.mht.gz - a gzipped multipart/related wrapper
 * with Content-Type: application/dicom, the same format RawDicomWriter used
 * and the format dicomwebserver serves for instance retrieval.
 * The source bytes are re-read from the parse stream, which retains its
 * buffers on the STOW path (clearBuffers is false there).
 * @param {Object} writer - DicomWebWriter used for this instance
 * @param {Object} stream - The stream the instance was parsed from
 * @param {string} sopInstanceUID - For logging
 * @returns {Promise<void>}
 */
async function writeRawPart10(writer, stream, sopInstanceUID) {
  const rawSize = stream?.size;
  const canReRead =
    typeof stream?.getBuffer === 'function' &&
    rawSize > 0 &&
    (typeof stream.hasData !== 'function' || stream.hasData(0, rawSize));
  if (!canReRead) {
    console.verbose('Raw Part 10 not stored for', sopInstanceUID, '- source bytes unavailable');
    return;
  }
  const raw = stream.getBuffer(0, rawSize);
  const rawBuffer = ArrayBuffer.isView(raw)
    ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
    : Buffer.from(raw);
  const rawStream = await writer.openInstanceStream('index.mht', {
    gzip: true,
    multipart: true,
    contentType: 'application/dicom',
    boundary: `BOUNDARY_${uuid()}`,
  });
  rawStream.stream.write(rawBuffer);
  await writer.closeStream(rawStream.streamKey);
}

/**
 * Floor for the unsettled write gate. The effective default is raised to the writer's
 * maxOpenStreams, which is the gate that actually bounds file handles.
 */
const DEFAULT_DRAIN_MAX_UNSETTLED = 25;

/**
 * Creates a filter that counts addTag/value calls and reports progress to StatusMonitor.
 * Uses a per-instance parse job so counts are not overwritten when multiple instances parse concurrently.
 * @param {{ typeId: string, jobId: string } | null} parentJob - Parent job (e.g. stowInstances) to update lastBytesReceivedAt for livelock; null to skip
 * @param {{ typeId: string, jobId: string } | null} parseJob - Per-instance job to update with parseTagsAdded/parseValuesAdded; created by caller so counts are per instance
 * @param {number} throttleMs - Min ms between updates
 * @returns {Object} Filter with addTag, value, and reportProgress methods
 */
function createProgressFilter(parentJob, parseJob, throttleMs) {
  let tagsAdded = 0;
  let valuesAdded = 0;
  let startMs = null;
  let lastReportMs = 0;

  function report(force = false) {
    const now = Date.now();
    if (parseJob && !force && now - lastReportMs < throttleMs) return;
    lastReportMs = now;
    const parseProgressMs = startMs != null ? now - startMs : 0;
    if (parseJob) {
      StatusMonitor.updateJob(parseJob.typeId, parseJob.jobId, {
        parseTagsAdded: tagsAdded,
        parseValuesAdded: valuesAdded,
        parseProgressMs,
        lastBytesReceivedAt: now,
      });
    }
    if (parentJob) {
      StatusMonitor.updateJob(parentJob.typeId, parentJob.jobId, {
        lastBytesReceivedAt: now,
      });
    }
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
      const isBinary =
        v instanceof ArrayBuffer ||
        Buffer.isBuffer(v) ||
        (ArrayBuffer.isView(v) && !(v instanceof DataView));
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
 * @param {{ add: (p: Promise) => Promise, limitUnsettled: (max, timeoutMs) => Promise }|undefined} [options.streamWritePromiseTracker] - Optional tracker for stream write promises (e.g. for back pressure). One is created when omitted. It is always passed to the writer, which registers every stream's completion promise with it, and the listener drain awaits limitUnsettled before emitting more frame data so we never open more streams than can be consumed.
 * @param {number} [options.drainMaxUnsettled] - Max unsettled stream writes allowed before the reader waits. Defaults to max(25, maxOpenStreams) so this gate never binds before the open file gate; pass a value explicitly only to cap a tracker shared across instances.
 * @param {number} [options.drainTimeoutMs=5000] - Timeout in ms for drain wait.
 * @param {number} [options.maxOpenStreams=32] - Max streams (file handles) the writer keeps open at once; the reader waits for room before emitting more frame/bulkdata values.
 * @param {number} [options.drainOpenStreamsTimeoutMs=60000] - Max time to wait for in-flight closes once the instance is parsed.
 * @param {boolean} options.bulkdata - Enable bulkdata filter (default: true if writer exists). Set to false to use frames filter instead
 * @param {number} options.sizeBulkdataTags - Size threshold in bytes for public tags (default: 128k + 2 bytes)
 * @param {number} options.sizePrivateBulkdataTags - Size threshold in bytes for private tags (default: 128 bytes)
 * @param {{ typeId: string, jobId: string }} [options.statusMonitorJob] - If set, progress (parseTagsAdded, parseProgressMs) is reported to StatusMonitor.updateJob for this job.
 * @param {number} [options.progressThrottleMs=50] - Min ms between progress updates when statusMonitorJob is set.
 * @returns {Promise<{meta, dict, writer, informationFilter}>} - Parsed metadata and optional writer/filter instances
 */
export async function instanceFromStream(stream, options = {}) {
  const reader = new AsyncDicomReader();

  // Check if the input is a ReadBufferStream instance or a buffer-stream-like (e.g. TrackableReadBufferStream from another package copy of dcmjs)
  if (stream instanceof ReadBufferStream || isReadBufferStreamLike(stream)) {
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

  // The tracker has to exist before the writer, because the writer is what registers each
  // stream's completion promise with it. Back pressure below waits on those promises, so a
  // tracker the writer does not know about would always look idle and never push back.
  const streamWritePromiseTracker =
    options.streamWritePromiseTracker ||
    options.writerOptions?.streamWritePromiseTracker ||
    createPromiseTracker('instanceFromStream');

  // Create writer using the listener's information object
  let writer = null;
  if (DicomWebWriterClass) {
    const writerOptions = {
      baseDir: options.dicomdir,
      maxOpenStreams: options.maxOpenStreams,
      ...options.writerOptions,
      streamWritePromiseTracker,
    };
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

  // Per-instance parse job so tag/value counts are not overwritten when multiple instances parse concurrently
  const parentJob = options.statusMonitorJob ?? null;
  const parseJobId = parentJob != null ? StatusMonitor.startJob(PARSE_JOB_TYPE, {}) : null;
  const parseJob = parseJobId != null ? { typeId: PARSE_JOB_TYPE, jobId: parseJobId } : null;
  const progressThrottleMs = options.progressThrottleMs ?? 50;
  const progressFilter = createProgressFilter(parentJob, parseJob, progressThrottleMs);
  filters.unshift(progressFilter);

  // Create listener with filters
  // The listener will automatically create its own information filter and call init()
  const listener = new DicomMetadataListener({ information }, ...filters);

  // Wire drain (backpressure) to the writer and the stream write promise tracker so we don't
  // emit frame fragments faster than streams can be consumed (prevents too many open files).
  if (writer) {
    // The writer registers every stream promise with this tracker, so unsettled writes and open
    // streams are largely the same set. A gate narrower than maxOpenStreams would therefore bind
    // before the open stream gate does, capping concurrency below --max-open-files (and costing a
    // drainTimeoutMs wait for every attempt to exceed it), so the default widens to match it.
    const drainMaxUnsettled =
      options.drainMaxUnsettled ??
      Math.max(DEFAULT_DRAIN_MAX_UNSETTLED, writer.maxOpenStreams ?? 0);
    const drainTimeoutMs = options.drainTimeoutMs ?? 5000;
    if (drainMaxUnsettled < (writer.maxOpenStreams ?? 0)) {
      console.verbose(
        `[instanceFromStream] drainMaxUnsettled ${drainMaxUnsettled} is below maxOpenStreams ${writer.maxOpenStreams}; unsettled writes rather than open files will limit concurrency`
      );
    }
    listener.setDrain(async () => {
      // Open file handles first: they are the hard resource limit, and the writer knows
      // exactly how many of its own streams are still open.
      await writer.awaitOpenStreamLimit();
      return streamWritePromiseTracker.limitUnsettled(drainMaxUnsettled, drainTimeoutMs);
    });
  }

  // Final validation of stream state before reading (especially for ReadBufferStream)
  if (reader.stream instanceof ReadBufferStream || isReadBufferStreamLike(reader.stream)) {
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

  // If stream was already aborted (e.g. STOW timeout), exit immediately with aborted error
  const streamForAbort = reader.stream;
  if (streamForAbort?.abortedReason) {
    if (parseJobId != null) {
      StatusMonitor.endJob(PARSE_JOB_TYPE, parseJobId, {
        failed: true,
        error: streamForAbort.abortedReason?.message ?? 'Request aborted',
      });
    }
    const e = new Error(streamForAbort.abortedReason?.message ?? 'Request aborted');
    e.code = 'ABORTED';
    e.aborted = true;
    throw e;
  }

  let fmi;
  let dict;
  let parseError = null;
  try {
    const result = await reader.readFile({ listener });
    fmi = result.fmi;
    dict = result.dict;
  } catch (err) {
    parseError = err;
    writer?.abort(err);
    writer?.rollbackPendingMoves();
    throw err;
  } finally {
    progressFilter.reportProgress?.();
    if (parseJobId != null) {
      StatusMonitor.endJob(
        PARSE_JOB_TYPE,
        parseJobId,
        parseError ? { failed: true, error: parseError?.message ?? String(parseError) } : {}
      );
    }
  }

  // If stream was aborted during parse (e.g. STOW timeout), treat response as aborted
  if (streamForAbort?.abortedReason) {
    const e = new Error(streamForAbort.abortedReason?.message ?? 'Request aborted');
    e.code = 'ABORTED';
    e.aborted = true;
    throw e;
  }

  try {
    if (dict && reader.meta) {
      const meta = reader.meta;
      const transferSyntax = meta['00020010']?.Value?.[0];
      if (transferSyntax) {
        setValue(dict, Tags.AvailableTransferSyntaxUID, transferSyntax);
      }
    }

    console.verbose('Finished parsing file', information.sopInstanceUid);

    if (writer) {
      console.verbose('Writing metadata to file', information.sopInstanceUid);
      const metadataStream = await writer.openInstanceStream('metadata', { gzip: true });
      metadataStream.stream.write(Buffer.from(JSON.stringify([dict])));
      await writer.closeStream(metadataStream.streamKey);
    }

    // Store the original Part 10 binary for segmentations/structured reports so
    // instance retrieval can serve it directly instead of re-creating it.
    if (writer && options.writeRawPart10 !== false && shouldStoreRawPart10(dict)) {
      try {
        await writeRawPart10(writer, reader.stream, information.sopInstanceUid);
      } catch (err) {
        console.warn(
          'Unable to store raw Part 10 for',
          information.sopInstanceUid,
          err?.message ?? err
        );
      }
    }

    // Wait for all frame/bulkdata writes to complete before returning. The filters close those
    // streams without awaiting, so this both flushes the in-flight closes and releases the
    // handle of anything that was never closed.
    await writer?.drainOpenStreams(options.drainOpenStreamsTimeoutMs);
    console.verbose('Finished writing metadata to file', information.sopInstanceUid);

    const result = { fmi, dict, writer, information: listener.information };

    // If a validateInstance hook is provided, run it before committing temp files.
    if (options.validateInstance) {
      await options.validateInstance(result);
    }

    // Commit deferred moves (rename temp → final). No-op on base class.
    await writer?.commitPendingMoves();

    return result;
  } catch (err) {
    writer?.rollbackPendingMoves();
    throw err;
  }
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
