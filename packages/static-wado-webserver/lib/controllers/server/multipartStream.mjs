import Dicer from 'dicer';
import { randomUUID } from 'node:crypto';
import { data } from 'dcmjs';
import { parse as parseContentType } from 'content-type';

/**
 * Dicer-based multipart parser middleware for DICOMweb STOW-RS.
 *
 * @param {object} opts
 * @param {(fileInfo: object, stream: any) => Promise<any>} opts.listener
 * @param {object} [opts.limits]
 * @param {number} [opts.limits.fileSize]  Max bytes per DICOM part (optional)
 * @param {number} [opts.limits.parts]     Max number of parts (optional)
 * @param {number} [opts.limits.totalSize] Max total bytes across all parts (optional)
 * @param {(err: any, fileInfo?: object) => void} [opts.onStreamError]
 * @param {(req: object) => Promise<void>} [opts.beforeProcessPart] Await before processing each DICOM part (for back pressure)
 * @param {(req: object, fileInfo: object, headers: object) => import('./TrackableReadBufferStream.mjs').TrackableReadBufferStream} opts.createBufferStream Create buffer stream for each part (return value must have addBuffer, setComplete; optional shouldPause/waitForBackPressure for backpressure)
 */
export function multipartStream(opts) {
  const { listener, limits, onStreamError, beforeProcessPart, createBufferStream } = opts;

  if (typeof listener !== 'function') {
    throw new Error('multipartStream: opts.listener must be a function');
  }
  if (typeof createBufferStream !== 'function') {
    throw new Error('multipartStream: opts.createBufferStream must be a function');
  }

  return function middleware(req, res, next) {
    req.uploadStreams = [];
    req.uploadListenerPromises = [];
    req.body = req.body ?? {};

    const contentTypeHeader = req.headers['content-type'] || '';
    if (!contentTypeHeader.toLowerCase().startsWith('multipart/')) {
      return next();
    }

    let boundary;
    let topType;
    let topParams;

    try {
      const parsed = parseContentType(contentTypeHeader);
      topType = parsed.type; // e.g. multipart/related
      topParams = parsed.parameters; // boundary, type, start, ...
      boundary = parsed.parameters?.boundary;
    } catch (err) {
      return next(Object.assign(new Error('Invalid Content-Type header'), { cause: err }));
    }

    if (!boundary) {
      return next(new Error('Multipart request missing boundary parameter'));
    }

    // Remove quotes from boundary if present (some clients quote the boundary value)
    let cleanBoundary = boundary.replace(/^["']|["']$/g, '');

    // Dicer expects the boundary value that appears in the Content-Type header parameter.
    // Standard multipart: boundary="abc123", body has "--abc123\r\n", Dicer needs "abc123"
    // Dicer automatically adds "--" when looking for delimiters in the body.
    //
    // However, some clients may include dashes in the boundary parameter itself.
    // If boundary="----abc" and body uses "--${boundary}", the body has "------abc".
    // In this case, Dicer should receive "----abc" and will look for "--" + "----abc" = "------abc".
    //
    // Since we're seeing empty headers (parts not being recognized), there might be a mismatch.
    // Let's try the original boundary first (for backward compatibility), but also prepare
    // a normalized version in case we need to fall back.
    const boundaryCore = cleanBoundary.replace(/^-+/, '');
    const hasLeadingDashes = cleanBoundary !== boundaryCore;

    // Keep the original boundary - Dicer should handle it correctly
    // If the body format matches (i.e., body uses "--${boundary}" where boundary may have dashes),
    // Dicer will find the parts. If not, we'll see empty headers and can investigate further.

    // If you only want to accept STOW-RS:
    // if (topType.toLowerCase() !== "multipart/related") return next();

    const dicer = new Dicer({ boundary: cleanBoundary });

    let partCount = 0;
    let totalBytes = 0;
    let aborted = false;
    let completedParts = 0; // Track how many parts have completed
    let dicerFinished = false; // Track if Dicer has finished parsing
    let nextCalled = false; // Prevent multiple calls to next()

    const abort = err => {
      if (aborted) return;
      aborted = true;

      // Stop reading more request data
      try {
        req.unpipe(dicer);
      } catch {}
      try {
        req.destroy?.(err);
      } catch {}
      try {
        dicer.removeAllListeners();
      } catch {}

      next(err);
    };

    dicer.on('part', part => {
      if (aborted) {
        part.resume();
        return;
      }

      partCount += 1;
      console.warn(`[multipartStream] Part ${partCount} detected`);

      if (limits?.parts && partCount > limits.parts) {
        part.resume();
        return;
      }

      // Dicer's PartStream doesn't expose headers as a property
      // Headers are emitted via 'header' events on the part stream
      // We need to pause the part and wait for headers before processing
      let headers = {};
      let headersCollected = false;
      let partProcessed = false; // Ensure we only process each part once

      // Pause the part stream until we have headers
      part.pause();

      // Function to process the part once we have headers
      const processPart = () => {
        if (aborted || partProcessed) {
          part.resume();
          return;
        }
        partProcessed = true;

        if (aborted) {
          part.resume();
          return;
        }

        // Continue with processing (part stays paused until continuePartProcessing resumes it after back pressure)
        continuePartProcessing();
      };

      // Listen for header events on the part stream
      part.on('header', header => {
        // Dicer provides headers as an object with lowercase keys and array values
        if (header && typeof header === 'object' && !partProcessed) {
          console.warn(
            `[multipartStream] Part ${partCount} headers received:`,
            Object.keys(header)
          );
          headers = header;
          headersCollected = true;
          processPart();
        }
      });

      // Also check if headers are available immediately (some versions might)
      if (part.headers && Object.keys(part.headers).length > 0) {
        headers = part.headers;
        headersCollected = true;
        processPart();
        return; // Exit early since we have headers
      }

      // If headers aren't available, try to resume after a short delay
      // This handles cases where headers might come via data events
      // Increased timeout to ensure headers are collected for all parts
      setTimeout(() => {
        if (!headersCollected && !partProcessed) {
          console.warn(`[multipartStream] Part ${partCount} processing without headers (timeout)`);
          processPart();
        }
      }, 100);

      // Function to continue processing the part once headers are available
      // This creates a fresh buffer stream for each part
      const continuePartProcessing = async () => {
        // Await back pressure hook before accepting data (part stays paused)
        if (beforeProcessPart) {
          await beforeProcessPart(req);
        }
        if (aborted) {
          part.resume();
          return;
        }
        // Resume the part stream now that we have capacity
        part.resume();

        const getHeader = name => {
          const lowerName = name.toLowerCase();

          // First try direct lookup (Dicer lowercases header names)
          let v = headers[lowerName];

          // If not found, try case-insensitive search through all keys
          if (!v) {
            for (const key of Object.keys(headers)) {
              if (key.toLowerCase() === lowerName) {
                v = headers[key];
                break;
              }
            }
          }

          if (!v) {
            return undefined;
          }

          // Handle array values (Dicer provides arrays)
          if (Array.isArray(v)) {
            return v.join(', ').trim();
          }

          return String(v).trim();
        };

        const rawContentType = getHeader('content-type');
        const contentId = getHeader('content-id');
        const contentLocation = getHeader('content-location');

        console.warn(
          `[multipartStream] Part ${partCount} headers - content-type: ${rawContentType}, content-location: ${contentLocation}, headers keys: ${Object.keys(headers).join(', ')}`
        );

        // If Content-Type is missing, try to infer from Content-Location
        let inferredContentType = rawContentType;
        if (!inferredContentType && contentLocation) {
          // If Content-Location has .dcm extension, likely DICOM
          if (contentLocation.toLowerCase().endsWith('.dcm')) {
            inferredContentType = 'application/dicom';
          }
        }

        const partContentType = (inferredContentType || 'application/octet-stream')
          .toLowerCase()
          .trim();

        // If you're "part 10 only", you probably want to accept:
        // - application/dicom
        // - application/dicom; transfer-syntax=...
        // - application/dicom+octet-stream (sometimes seen)
        const isDicomPart = partContentType.startsWith('application/dicom');

        // If you want to skip non-DICOM parts (e.g. metadata JSON), do it here:
        if (!isDicomPart) {
          console.warn(
            `[multipartStream] Part ${partCount} skipped - not DICOM (content-type: ${partContentType})`
          );
          // Set up handler to track when skipped part completes
          const skippedEndHandler = () => {
            completedParts += 1;
            console.warn(
              `[multipartStream] Skipped part ${partCount} completed. Completed: ${completedParts}/${partCount}`
            );
            part.removeListener('end', skippedEndHandler);
            checkAllPartsComplete();
          };
          part.on('end', skippedEndHandler);
          // Drain the stream so the request can complete cleanly
          part.resume();
          return;
        }

        console.warn(`[multipartStream] Part ${partCount} processing as DICOM file`);
        const fileId = randomUUID();

        // You won't have Busboy's fieldname/filename concept in STOW-RS,
        // so we build a "fileInfo" from MIME headers.
        const fileInfo = {
          fileId,
          fieldname: contentId || contentLocation || `part-${partCount}`,
          filename: undefined, // STOW-RS doesn't usually provide this
          encoding: undefined, // not meaningful here
          mimeType: partContentType,
          headers: {
            'content-type': getHeader('content-type'),
            'content-id': contentId,
            'content-location': contentLocation,
          },
        };

        // Create buffer stream for this part (required option; e.g. streamPostController passes tracker via req)
        const readBufferStream = createBufferStream(req, fileInfo, headers);

        // Kick off your listener (do NOT await)
        try {
          const p = Promise.resolve(listener(fileInfo, readBufferStream, req));
          // Add error handler to prevent unhandled promise rejections
          // The error will still be caught by Promise.allSettled in completePostController
          p.catch(err => {
            console.error(
              `[multipartStream] Unhandled error in listener for Part ${partCount}:`,
              err.message || String(err)
            );
            readBufferStream.setComplete();
            if (onStreamError) onStreamError(err, fileInfo);
            // Resume part so it drains and emits 'end' – otherwise a paused part never completes
            // and blocks subsequent parts from being processed (e.g. good file after bad one).
            part.resume();
          });
          req.uploadListenerPromises.push(p);
          console.warn(
            `[multipartStream] Part ${partCount} added to uploadListenerPromises (total: ${req.uploadListenerPromises.length})`
          );
        } catch (err) {
          readBufferStream.setComplete();
          if (onStreamError) onStreamError(err, fileInfo);
          part.resume();
        }

        req.uploadStreams.push({ fileInfo, stream: readBufferStream });
        console.warn(
          `[multipartStream] Part ${partCount} added to uploadStreams (total: ${req.uploadStreams.length})`
        );

        // Create a closure-scoped variable to track bytes for this specific part
        let partBytes = 0;

        // Set up event handlers for this specific part and buffer stream
        // These handlers are scoped to this part instance only
        const dataHandler = chunk => {
          if (aborted) return;
          // If stream was marked complete (e.g. listener threw), discard further data and skip backpressure.
          // Explicitly resume so the part drains (Dicer needs this to parse the next boundary and emit Part 2+).
          if (readBufferStream.isComplete) {
            part.resume();
            return;
          }

          partBytes += chunk.length;
          totalBytes += chunk.length;

          if (limits?.fileSize && partBytes > limits.fileSize) {
            const err = Object.assign(new Error('File too large'), { statusCode: 413 });
            if (onStreamError) onStreamError(err, fileInfo);
            readBufferStream.setComplete();
            part.removeListener('data', dataHandler);
            part.resume();
            return;
          }

          if (limits?.totalSize && totalBytes > limits.totalSize) {
            const err = Object.assign(new Error('Request too large'), { statusCode: 413 });
            if (onStreamError) onStreamError(err, fileInfo);
            readBufferStream.setComplete();
            part.removeListener('data', dataHandler);
            part.resume();
            return;
          }

          try {
            // Copy the buffer to avoid reuse issues - Node.js streams can reuse buffers
            // Each chunk is added to this part's dedicated buffer stream
            const chunkCopy = Buffer.from(chunk);
            readBufferStream.addBuffer(chunkCopy);

            // Backpressure: delegated to stream (shouldPause / waitForBackPressure)
            const resumeWhenReady = () => {
              if (!aborted) part.resume();
            };
            if (readBufferStream.shouldPause?.()) {
              part.pause();
              readBufferStream
                .waitForBackPressure()
                .then(resumeWhenReady)
                .catch(() => resumeWhenReady());
            }
          } catch (err) {
            if (onStreamError) onStreamError(err, fileInfo);
            readBufferStream.setComplete();
            part.removeListener('data', dataHandler);
            part.resume();
            return;
          }
        };;

        const endHandler = () => {
          // Clean up event listeners for this part
          part.removeListener('data', dataHandler);
          part.removeListener('end', endHandler);
          try {
            // Mark this part's buffer stream as complete
            console.warn('********* Setting file complete');
            readBufferStream.setComplete();
            completedParts += 1;
            console.warn(
              `[multipartStream] Part ${partCount} completed. Completed: ${completedParts}/${partCount}`
            );
            checkAllPartsComplete();
          } catch (err) {
            if (onStreamError) onStreamError(err, fileInfo);
            // Don't increment completedParts or check completion on error - abort immediately
            return abort(err);
          }
        };

        const errorHandler = err => {
          console.warn('errorHandler:', err);
          // Clean up event listeners for this part
          part.removeListener('data', dataHandler);
          part.removeListener('end', endHandler);
          part.removeListener('error', errorHandler);
          if (onStreamError) onStreamError(err, fileInfo);
          abort(err);
        };

        part.on('data', dataHandler);
        part.on('end', endHandler);
        part.on('error', errorHandler);
      }; // end of continuePartProcessing
    });

    dicer.on('error', err => abort(err));

    // Function to check if all parts have completed and call next() if ready
    // This now waits for listener promises to ensure streams are fully processed
    const checkAllPartsComplete = async () => {
      if (aborted || nextCalled) return;

      // If no parts were detected, proceed immediately when Dicer finishes
      if (dicerFinished && partCount === 0) {
        console.warn(`[multipartStream] Dicer finished with no parts detected`);
        nextCalled = true;
        next();
        return;
      }

      // Only proceed if Dicer has finished parsing AND all parts have completed
      if (dicerFinished && completedParts >= partCount && partCount > 0) {
        console.warn(
          `[multipartStream] All parts completed. Total parts: ${partCount}, Completed: ${completedParts}, uploadStreams: ${req.uploadStreams.length}, uploadListenerPromises: ${req.uploadListenerPromises.length}`
        );

        // Wait for all listener promises to complete before calling next()
        // This ensures streams are fully processed and not deallocated prematurely
        if (req.uploadListenerPromises && req.uploadListenerPromises.length > 0) {
          try {
            console.warn(
              `[multipartStream] Waiting for ${req.uploadListenerPromises.length} listener promise(s) to complete...`
            );
            await Promise.allSettled(req.uploadListenerPromises);
            console.warn(`[multipartStream] All listener promises completed`);
          } catch (err) {
            // Errors in individual promises are handled by completePostController
            // We just need to wait for them to finish
            console.warn(
              `[multipartStream] Some listener promises had errors (will be handled by completePostController)`
            );
          }
        }

        if (!nextCalled) {
          nextCalled = true;
          next();
        }
      }
    };

    // Dicer signals "no more parts" with finish.
    // This means all parts have been detected, but individual part streams may still be active.
    dicer.on('finish', () => {
      if (aborted) return;
      dicerFinished = true;
      console.warn(
        `[multipartStream] Dicer finished parsing. Total parts: ${partCount}, Completed: ${completedParts}, uploadStreams: ${req.uploadStreams.length}, uploadListenerPromises: ${req.uploadListenerPromises.length}`
      );
      // Check if all parts have already completed (might happen if parts finish before Dicer finishes)
      checkAllPartsComplete();
    });

    // Pipe request directly to Dicer
    req.pipe(dicer);
  };
}
