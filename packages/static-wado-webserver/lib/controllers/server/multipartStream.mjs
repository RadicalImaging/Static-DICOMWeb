import Busboy from "busboy";
import { randomUUID } from "node:crypto";
import { data } from 'dcmjs';

const { ReadBufferStream } = data;

/**
 * Factory for Express middleware.
 *
 * @param {object} opts
 * @param {(fileInfo: object, stream: any) => Promise<any>} opts.listener
 *        Called once per file with metadata + the new ReadBufferStream.
 *        The returned promise is NOT awaited here; it is stored for external management.
 *
 * @param {() => any} opts.createReadBufferStream
 *        Must return a new ReadBufferStream instance that has:
 *          - addBuffer(Buffer) synchronous
 *          - complete() synchronous
 *
 * @param {object} [opts.limits] busboy limits
 * @param {(err: any, fileInfo?: object) => void} [opts.onStreamError] optional hook
 */
export function multipartStream(opts) {
  const {
    listener,
    limits,
    onStreamError,
  } = opts;

  if (typeof listener !== "function") {
    throw new Error("busboyToReadBufferStreams: opts.listener must be a function");
  }
  if (typeof createReadBufferStream !== "function") {
    throw new Error(
      "busboyToReadBufferStreams: opts.createReadBufferStream must be a function"
    );
  }

  return function middleware(req, res, next) {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.startsWith("multipart/form-data")) return next();

    const busboy = Busboy({ headers: req.headers, limits });

    // Expose for downstream route handlers / separate completion management:
    // - req.uploadStreams: metadata + stream per file
    // - req.uploadListenerPromises: array of promises returned by listener
    req.uploadStreams = [];
    req.uploadListenerPromises = [];

    // Optional: collect fields too
    req.body = req.body ?? {};

    busboy.on("field", (name, value, info) => {
      req.body[name] = value;
      // info has encoding/mimeType-ish details for fields (busboy version-dependent)
    });

    busboy.on("file", (fieldname, fileStream, info) => {
      const fileId = randomUUID();
      const { filename, encoding, mimeType } = info;

      // "Headers" / metadata you can provide from busboy (derived from multipart part headers)
      const fileInfo = {
        fileId,
        fieldname,
        filename,
        encoding,
        mimeType,
        // Often useful extra context:
        // contentType: mimeType,
        // originalFilename: filename,
      };

      // 1) Create your streaming destination (one per file)
      const readBufferStream =  new ReadBufferStream(null, true, {
        noCopy: true,
      });

      // 2) Notify listener with headers + stream (do NOT await)
      // Listener promise is stored for separate management
      try {
        const p = Promise.resolve(listener(fileInfo, readBufferStream));
        req.uploadListenerPromises.push(p);
      } catch (err) {
        // listener threw synchronously
        if (onStreamError) onStreamError(err, fileInfo);
        // If listener fails at start, we should still drain the upload stream
        // to avoid socket hangups, but likely abort the request.
        // Easiest: forward error; busboy will stop when req is closed.
        return next(err);
      }

      // Expose metadata+stream so other middleware/handlers can see them
      req.uploadStreams.push({ fileInfo, stream: readBufferStream });

      // 3) Stream chunks synchronously into readBufferStream
      fileStream.on("data", (chunk) => {
        // chunk is a Node Buffer
        try {
          readBufferStream.addBuffer(chunk); // synchronous
        } catch (err) {
          if (onStreamError) onStreamError(err, fileInfo);
          // If destination errors, stop consuming more data from this file.
          // - unpipe & destroy the file stream to stop flow
          // - then error out the request
          fileStream.unpipe?.();
          fileStream.destroy?.(err);
          req.unpipe?.(busboy);
          busboy.removeAllListeners();
          return next(err);
        }
      });

      fileStream.on("end", () => {
        try {
          readBufferStream.complete(); // synchronous
        } catch (err) {
          if (onStreamError) onStreamError(err, fileInfo);
          return next(err);
        }
      });

      fileStream.on("limit", () => {
        // busboy limit reached for this file (limits.fileSize)
        // Decide your policy: abort request, mark file as truncated, etc.
        // If you want to abort:
        // const err = Object.assign(new Error("File too large"), { statusCode: 413 });
        // return next(err);
      });

      fileStream.on("error", (err) => {
        if (onStreamError) onStreamError(err, fileInfo);
        return next(err);
      });
    });

    busboy.on("error", (err) => next(err));

    // Important: finish means busboy finished parsing the request body.
    // It does NOT mean your listener promises resolved (you manage separately).
    busboy.on("finish", () => next());

    req.pipe(busboy);
  };
}
