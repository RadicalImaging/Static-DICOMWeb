import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { dirScanner } from '@radicalimaging/static-wado-util';
import { parseAndLogDicomJsonErrors } from './parseDicomJsonErrors.mjs';

/**
 * Stores DICOM files to a STOW-RS endpoint
 * @param {string|string[]} fileNames - File(s) or directory(ies) to process
 * @param {Object} options - Options object
 * @param {string} options.url - URL endpoint for STOW-RS storage
 * @param {Object} [options.headers] - Additional HTTP headers to include
 * @param {number} [options.maxGroupSize] - Maximum size in bytes for grouping files (default: 10MB)
 * @param {boolean} [options.sendAsSingleFiles] - If true, send each file individually instead of grouping (default: false)
 * @param {boolean} [options.xmlResponse] - If true, request XML response format instead of JSON (default: false)
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds; no timeout if omitted
 */
export async function stowMain(fileNames, options = {}) {
  const {
    url,
    headers = {},
    maxGroupSize = 10 * 1024 * 1024,
    sendAsSingleFiles = false,
    xmlResponse = false,
    timeoutMs,
  } = options; // Default 10MB

  if (!url) {
    throw new Error('url option is required');
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  // When sendAsSingleFiles is true, set maxGroupSize to 0 to force groups of size 1
  const effectiveMaxGroupSize = sendAsSingleFiles ? 0 : maxGroupSize;

  // Group files by size
  const fileGroup = [];
  let currentGroupSize = 0;
  let isFirstAttempt = true;

  const flushGroup = async () => {
    if (fileGroup.length === 0) return;

    try {
      await stowFiles(fileGroup, url, headers, xmlResponse, timeoutMs);
      results.success += fileGroup.length;
      const fileCount = fileGroup.length;
      console.log(`Stored group of ${fileCount} file(s)`);
      isFirstAttempt = false;
    } catch (error) {
      // Check if this is a connection failure (not an HTTP error)
      const isConnectionError =
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ECONNRESET') ||
        error.cause?.code === 'ECONNREFUSED' ||
        error.cause?.code === 'ENOTFOUND' ||
        error.cause?.code === 'ETIMEDOUT' ||
        error.cause?.code === 'ECONNRESET';

      // If it's a connection error on the first attempt, exit immediately
      if (isFirstAttempt && isConnectionError) {
        console.error(`Failed to connect to endpoint ${url}: ${error.message}`);
        console.error('Exiting due to connection failure');
        process.exit(1);
      }

      // Otherwise, treat it as a regular error and continue
      results.failed += fileGroup.length;
      fileGroup.forEach(({ filePath }) => {
        results.errors.push({ file: filePath, error: error.message });
        console.error(`Failed to store ${filePath}: ${error.message}`);
      });
      isFirstAttempt = false;
    }

    fileGroup.length = 0;
    currentGroupSize = 0;
  };

  await dirScanner(fileNames, {
    ...options,
    recursive: true,
    callback: async filename => {
      try {
        const stats = fs.statSync(filename);
        const fileSize = stats.size;

        // If adding this file would exceed the group size, flush the current group
        // (skip this check when sendAsSingleFiles is true, as we'll flush after each file anyway)
        if (
          !sendAsSingleFiles &&
          fileGroup.length > 0 &&
          currentGroupSize + fileSize > effectiveMaxGroupSize
        ) {
          await flushGroup();
        }

        // Add file to current group
        fileGroup.push({ filePath: filename, fileSize });
        currentGroupSize += fileSize;

        // If sendAsSingleFiles is true, flush after each file (group of size 1)
        if (sendAsSingleFiles) {
          await flushGroup();
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ file: filename, error: error.message });
        console.error(`Failed to process ${filename}: ${error.message}`);
      }
    },
  });

  // Flush any remaining files in the group
  await flushGroup();

  console.log(`\nStorage complete: ${results.success} succeeded, ${results.failed} failed`);
  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(({ file, error }) => {
      console.log(`  ${file}: ${error}`);
    });
  }

  return results;
}

/**
 * Stores multiple DICOM files to a STOW-RS endpoint in a single multipart request
 * @param {Array<{filePath: string, fileSize: number}>} files - Array of file objects with path and size
 * @param {string} endpointUrl - URL endpoint for STOW-RS storage
 * @param {Object} additionalHeaders - Additional HTTP headers to include
 * @param {boolean} [xmlResponse=false] - If true, request XML response format instead of JSON
 * @param {number} [timeoutMs] - Request timeout in milliseconds; no timeout if omitted
 */
export async function stowFiles(
  files,
  endpointUrl,
  additionalHeaders = {},
  xmlResponse = false,
  timeoutMs
) {
  if (files.length === 0) {
    return;
  }

  const boundary = `StaticWadoBoundary${randomUUID()}`;
  const contentType = `multipart/related; type="application/dicom"; boundary=${boundary}`;

  // Create streaming multipart body with multiple files
  const { bodyStream, contentLength } = createMultipartBodyStreamMultiple(files, boundary);

  // Prepare headers
  const requestHeaders = {
    'Content-Type': contentType,
    'Content-Length': contentLength.toString(),
    Accept: xmlResponse ? 'application/dicom+xml' : 'application/dicom+json',
    ...additionalHeaders,
  };

  // Optional timeout via AbortController
  let signal;
  let timeoutId;
  if (timeoutMs != null && timeoutMs > 0) {
    const controller = new AbortController();
    signal = controller.signal;
    timeoutId = setTimeout(
      () => controller.abort(new Error(`The operation timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  }

  try {
    // Send POST request
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: requestHeaders,
      duplex: 'half',
      body: bodyStream,
      ...(signal && { signal }),
    });

    console.verbose('Server response status:', response.status, response.statusText);
    console.noQuiet('Server response headers:', Object.fromEntries(response.headers.entries()));
    const responseText = await response.text().catch(() => '');
    if (responseText) {
      console.verbose('Server response body:', responseText);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${responseText}`);
    }

    // Parse JSON DICOM response if applicable and log errors
    await parseAndLogDicomJsonErrors(response, responseText, files);

    return response;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Creates a multipart/related body for STOW-RS request with multiple files
 * @param {Array<{filePath: string, fileSize: number}>} files - Array of file objects
 * @param {string} boundary - Multipart boundary
 * @returns {Promise<Buffer>} Complete multipart body as buffer
 */
function createMultipartBodyStreamMultiple(files, boundary) {
    const footerStr = `\r\n--${boundary}--\r\n`;
    const footerLen = Buffer.byteLength(footerStr, 'utf-8');

    let contentLength = footerLen;

    for (let i = 0; i < files.length; i++) {
        const { filePath, fileSize } = files[i];
        const fileName = path.basename(filePath);
        const headerStr = multipartPartHeader(boundary, fileName, i === 0);
        const headerLen = Buffer.byteLength(headerStr, 'utf-8');
        contentLength += headerLen + fileSize;
    }

    async function* gen() {
        for (let i = 0; i < files.length; i++) {
            const { filePath } = files[i];
            const fileName = path.basename(filePath);

            console.verbose(`Reading file: ${filePath}`);

            yield Buffer.from(multipartPartHeader(boundary, fileName, i === 0), 'utf-8');

            const fileStream = fs.createReadStream(filePath);
            for await (const chunk of fileStream) {
                yield chunk;
            }
        }

        yield Buffer.from(footerStr, 'utf-8');
    }

    return { bodyStream: Readable.from(gen()), contentLength };
}

function multipartPartHeader(boundary, fileName, isFirstPart) {
    // First part starts with --boundary, subsequent parts need \r\n before --boundary
    const boundaryPrefix = isFirstPart ? '' : '\r\n';
    return [
        `${boundaryPrefix}--${boundary}\r\n`,
        `Content-Type: application/dicom\r\n`,
        `Content-Location: ${fileName}\r\n`,
        `\r\n`,
    ].join('');
}

