import Dicer from "dicer";
import { randomUUID } from "node:crypto";
import { data } from "dcmjs";
import { parse as parseContentType } from "content-type";

const { ReadBufferStream } = data;

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
 */
export function multipartStream(opts) {
  const { listener, limits, onStreamError } = opts;

  if (typeof listener !== "function") {
    throw new Error("multipartStream: opts.listener must be a function");
  }

  return function middleware(req, res, next) {
    req.uploadStreams = [];
    req.uploadListenerPromises = [];
    req.body = req.body ?? {};

    const contentTypeHeader = req.headers["content-type"] || "";
    if (!contentTypeHeader.toLowerCase().startsWith("multipart/")) {
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
      return next(Object.assign(new Error("Invalid Content-Type header"), { cause: err }));
    }

    if (!boundary) {
      return next(new Error("Multipart request missing boundary parameter"));
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

    const abort = (err) => {
      if (aborted) return;
      aborted = true;

      // Stop reading more request data
      try { req.unpipe(dicer); } catch {}
      try { req.destroy?.(err); } catch {}
      try { dicer.removeAllListeners(); } catch {}

      next(err);
    };

    dicer.on("part", (part) => {
      if (aborted) {
        part.resume();
        return;
      }

      partCount += 1;

      if (limits?.parts && partCount > limits.parts) {
        part.resume();
        return abort(Object.assign(new Error("Too many multipart parts"), { statusCode: 413 }));
      }

      // Dicer's PartStream doesn't expose headers as a property
      // Headers are emitted via 'header' events on the part stream
      // We need to pause the part and wait for headers before processing
      let headers = {};
      let headersCollected = false;
      
      // Pause the part stream until we have headers
      part.pause();
      
      // Function to process the part once we have headers
      const processPart = () => {
        if (aborted) {
          part.resume();
          return;
        }
        
        // Resume the part stream now that we have headers
        part.resume();
        
        // Continue with processing...
        continuePartProcessing();
      };
      
      // Listen for header events on the part stream
      part.on('header', (header) => {
        // Dicer provides headers as an object with lowercase keys and array values
        if (header && typeof header === 'object') {
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
      setTimeout(() => {
        if (!headersCollected) {
          processPart();
        }
      }, 10);
      
      // Function to continue processing the part once headers are available
      const continuePartProcessing = () => {
        const getHeader = (name) => {
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
          return v.join(", ").trim();
        }
        
          return String(v).trim();
        };

        const rawContentType = getHeader("content-type");
        const contentId = getHeader("content-id");
        const contentLocation = getHeader("content-location");
        
        // If Content-Type is missing, try to infer from Content-Location
        let inferredContentType = rawContentType;
      if (!inferredContentType && contentLocation) {
        // If Content-Location has .dcm extension, likely DICOM
        if (contentLocation.toLowerCase().endsWith('.dcm')) {
          inferredContentType = 'application/dicom';
        }
      }
        
        const partContentType = (inferredContentType || "application/octet-stream").toLowerCase().trim();

        // If you're "part 10 only", you probably want to accept:
        // - application/dicom
        // - application/dicom; transfer-syntax=...
        // - application/dicom+octet-stream (sometimes seen)
        const isDicomPart =
          partContentType.startsWith("application/dicom");

        // If you want to skip non-DICOM parts (e.g. metadata JSON), do it here:
        if (!isDicomPart) {
          // Drain the stream so the request can complete cleanly
          part.resume();
          return;
        }

        const fileId = randomUUID();

        // You won't have Busboy's fieldname/filename concept in STOW-RS,
        // so we build a "fileInfo" from MIME headers.
        const fileInfo = {
          fileId,
          fieldname: contentId || contentLocation || `part-${partCount}`,
          filename: undefined,            // STOW-RS doesn't usually provide this
          encoding: undefined,            // not meaningful here
          mimeType: partContentType,
          headers: {
            "content-type": getHeader("content-type"),
            "content-id": contentId,
            "content-location": contentLocation,
          },
        };

        const readBufferStream = new ReadBufferStream(null, true, { noCopy: true });

        // Kick off your listener (do NOT await)
        try {
          const p = Promise.resolve(listener(fileInfo, readBufferStream));
          req.uploadListenerPromises.push(p);
        } catch (err) {
          if (onStreamError) onStreamError(err, fileInfo);
          part.resume();
          return abort(err);
        }

        req.uploadStreams.push({ fileInfo, stream: readBufferStream });

        let partBytes = 0;

        part.on("data", (chunk) => {
          if (aborted) return;

          partBytes += chunk.length;
          totalBytes += chunk.length;

          if (limits?.fileSize && partBytes > limits.fileSize) {
            const err = Object.assign(new Error("File too large"), { statusCode: 413 });
            if (onStreamError) onStreamError(err, fileInfo);
            part.pause();
            return abort(err);
          }

          if (limits?.totalSize && totalBytes > limits.totalSize) {
            const err = Object.assign(new Error("Request too large"), { statusCode: 413 });
            if (onStreamError) onStreamError(err, fileInfo);
            part.pause();
            return abort(err);
          }

          try {
            // Copy the buffer to avoid reuse issues - Node.js streams can reuse buffers
            const chunkCopy = Buffer.from(chunk);
            readBufferStream.addBuffer(chunkCopy);
          } catch (err) {
            if (onStreamError) onStreamError(err, fileInfo);
            part.pause();
            return abort(err);
          }
        });

        part.on("end", () => {
          if (aborted) return;
          try {
            readBufferStream.setComplete();
          } catch (err) {
            if (onStreamError) onStreamError(err, fileInfo);
            return abort(err);
          }
        });

        part.on("error", (err) => {
          if (onStreamError) onStreamError(err, fileInfo);
          abort(err);
        });
      }; // end of continuePartProcessing
    });

    dicer.on("error", (err) => abort(err));

    // Dicer signals "no more parts" with finish.
    dicer.on("finish", () => {
      if (aborted) return;
      next();
    });

    // Pipe request directly to Dicer
    req.pipe(dicer);
  };
}
