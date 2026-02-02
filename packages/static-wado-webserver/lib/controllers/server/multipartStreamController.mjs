/* eslint-disable import/prefer-default-export */
import formidable from 'formidable';
import fs from 'fs';
import { PassThrough } from 'stream';
import { handleHomeRelative, logger } from '@radicalimaging/static-wado-util';

const { webserverLog } = logger;

const maxFileSize = 4 * 1024 * 1024 * 1024;
const maxTotalFileSize = 10 * maxFileSize;

/**
 * Creates a readable stream from a formidable file object.
 * For files saved to disk, creates a read stream from the filepath.
 * For in-memory files, creates a stream from the buffer if available.
 *
 * @param {Object} file - Formidable file object
 * @param {string} file.filepath - Path to the saved file
 * @param {Buffer} [file.buffer] - Optional in-memory buffer
 * @param {string} file.mimetype - MIME type of the file
 * @returns {ReadableStream} Readable stream appropriate for instanceFromStream
 */
function createFileStream(file) {
  // If file has a buffer (in-memory), create a stream from it
  if (file.buffer) {
    const stream = new PassThrough();
    stream.push(file.buffer);
    stream.push(null); // End the stream
    return stream;
  }

  // Otherwise, create a read stream from the filepath
  if (file.filepath) {
    return fs.createReadStream(file.filepath);
  }

  // Fallback: create an empty stream if neither is available
  const stream = new PassThrough();
  stream.push(null);
  return stream;
}

/**
 * Handles multipart/related POST requests using formidable to parse the upload
 * and creates readable streams appropriate for instanceFromStream.
 *
 * This controller is designed to work alongside streamPostController, providing
 * a streaming interface that doesn't require storing files first.
 *
 * @param {Object} params - Configuration parameters
 * @param {string} params.rootDir - Root directory for temporary file storage
 * @returns {Function} Express middleware function
 */
export function multipartStreamController(params) {
  const rootDir = handleHomeRelative(params.rootDir);
  const uploadDir = `${rootDir}/temp`;

  // Ensure temp directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const formOptions = {
    multiples: true,
    uploadDir,
    maxFileSize,
    maxTotalFileSize,
    keepExtensions: false,
    // Allow formidable to parse multipart/related content type
    allowEmptyFiles: false,
  };

  return async (req, res, next) => {
    const fileStreams = [];
    const form = formidable(formOptions);

    // Collect file streams as files are received
    form.on('file', (_formname, file) => {
      try {
        const { mimetype } = file;
        webserverLog.debug('Received upload file', file.filepath, mimetype);

        // Create a readable stream from the formidable file object
        const stream = createFileStream(file);
        stream.fileInfo = {
          filepath: file.filepath,
          mimetype,
          originalFilename: file.originalFilename,
          size: file.size,
        };

        fileStreams.push({
          stream,
          fileInfo: stream.fileInfo,
          // Keep reference to file for cleanup
          formidableFile: file,
        });
      } catch (e) {
        webserverLog.warn('Unable to create stream from file', e);
      }
    });

    try {
      // Parse the multipart/related request
      const [fields, files] = await form.parse(req);

      if (!fileStreams.length) {
        webserverLog.warn('No files uploaded');
        res.status(500).send('No files uploaded');
        return;
      }

      // Attach streams and metadata to request for downstream processing
      req.multipartStreams = fileStreams.map(item => ({
        stream: item.stream,
        fileInfo: item.fileInfo,
        fields, // Include parsed form fields
      }));

      // Store formidable files for cleanup
      req.formidableFiles = fileStreams.map(item => item.formidableFile);

      // Continue to next middleware/handler
      next();
    } catch (e) {
      webserverLog.error("Couldn't parse multipart upload:", e);
      res.status(500).json(`Unable to parse multipart upload: ${e}`);
    }
  };
}

/**
 * Helper function to clean up temporary files created by formidable.
 *
 * @param {Array} files - Array of formidable file objects with filepath property
 */
export async function cleanupFormidableFiles(files) {
  webserverLog.debug('Cleaning up formidable files', files?.length || 0);
  for (const file of files || []) {
    try {
      if (file?.filepath && fs.existsSync(file.filepath)) {
        await fs.promises.unlink(file.filepath);
      }
    } catch (e) {
      webserverLog.warn('Unable to unlink formidable file', file?.filepath);
    }
  }
}

/**
 * Example usage handler that processes streams with instanceFromStream:
 *
 * ```javascript
 * import { multipartStreamController, cleanupFormidableFiles } from './multipartStreamController.mjs';
 * import { instanceFromStream } from '@radicalimaging/create-dicomweb/lib/instance/instanceFromStream.mjs';
 *
 * router.post('/studies',
 *   multipartStreamController(params),
 *   async (req, res) => {
 *     const results = [];
 *     try {
 *       for (const { stream, fileInfo } of req.multipartStreams) {
 *         const result = await instanceFromStream(stream, {
 *           dicomdir: params.rootDir,
 *           // ... other options
 *         });
 *         results.push(result);
 *       }
 *       res.json({ success: true, results });
 *     } finally {
 *       await cleanupFormidableFiles(req.formidableFiles);
 *     }
 *   }
 * );
 * ```
 */
