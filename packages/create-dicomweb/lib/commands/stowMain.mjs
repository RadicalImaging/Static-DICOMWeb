import fs from "fs";
import path from "path";
import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  dirScanner,
  createPromiseTracker,
  createProgressReporter,
} from '@radicalimaging/static-wado-util';
import { parseAndLogDicomJsonErrors } from './parseDicomJsonErrors.mjs';

/** Timeout for createPromiseTracker limitUnsettled when waiting for the next storage slot (at least 30 minutes) */
const LIMIT_UNSETTLED_TIMEOUT_MS = 30 * 60 * 1000;
/** Timeout for "wait for all" when using parallel (24 hours) */
const WAIT_ALL_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** Number of times a group is sent again after a 503 response */
const MAX_UNAVAILABLE_RETRIES = 3;
/** Wait before a retry after a 503 with no Retry-After header, and the longest wait (seconds) */
const DEFAULT_RETRY_AFTER_SECONDS = 10;
const MAX_RETRY_AFTER_SECONDS = 10 * 60;
/** File extensions skipped when filenameCheck is on (lowercase, no dot) */
const SKIP_EXTENSIONS = new Set([
  'gz',
  'json',
  'md',
  'txt',
  'xml',
  'pdf',
  'py',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
  'svg',
  'ico',
  'tiff',
  'tif',
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'cjs',
  'zip',
  'zipx',
  'tar',
  'rar',
  '7z',
  'properties',
  'db',
  'csv',
]);

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
 * @param {number} [options.parallel=1] - Number of parallel STOW-RS requests (1 = sequential). When > 1, limitUnsettled uses at least 30 minutes.
 * @param {boolean} [options.filenameCheck=true] - If true, skip common non-DICOM extensions (e.g. gz, json, md, txt, xml, pdf, jpg, png, html, zip). Use false to upload all files.
 * @param {boolean} [options.progress] - If true, show progress with instance count as files are stored
 * @param {boolean} [options.quiet] - If true, suppress progress and non-error output
 * @param {boolean} [options.verbose] - If true, show per-group storage messages
 */
export async function stowMain(fileNames, options = {}) {
  const {
    url,
    headers = {},
    maxGroupSize = 10 * 1024 * 1024,
    sendAsSingleFiles = false,
    xmlResponse = false,
    timeoutMs,
    parallel = 1,
    filenameCheck = true,
    progress = false,
    quiet = false,
    verbose = false,
  } = options; // Default 10MB

  const showProgress = progress && !quiet;

  if (!url) {
    throw new Error('url option is required');
  }

  /** Count files that will be processed (respects filenameCheck) */
  const countFiles = async () => {
    let count = 0;
    await dirScanner(fileNames, {
      recursive: true,
      // The scan of the upload counts the unreadable paths
      onError: () => {},
      callback: async filename => {
        if (filenameCheck) {
          const ext = path.extname(filename).slice(1).toLowerCase();
          if (SKIP_EXTENSIONS.has(ext)) return;
          if (filename.endsWith('DICOMDIR')) return;
        }
        count++;
      },
    });
    return count;
  };

  const totalFiles = showProgress ? await countFiles() : 0;
  const progressReporter = createProgressReporter({ total: totalFiles, enabled: showProgress });

  if (showProgress && totalFiles > 0) {
    console.log(`\nStoring ${totalFiles} file(s)...\n`);
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

  const tracker = createPromiseTracker('stow');

  const runOneStow = async (group, requestTimeoutMs) => {
    try {
      const response = await stowFilesWithRetry(group, url, headers, xmlResponse, requestTimeoutMs);
      // 202: the server stored some instances only (SQR-U5). A body with no readable Failed
      // SOP Sequence (for example XML) still counts one file as failed.
      let failures = [];
      if (response?.status === 202) {
        failures = response.failures?.length
          ? response.failures
          : [
              {
                file: `a group of ${group.length} file(s)`,
                error: 'HTTP 202, some instances failed',
              },
            ];
      }
      const failed = Math.min(failures.length, group.length);
      results.success += group.length - failed;
      results.failed += failed;
      results.errors.push(...failures);
      console.verbose(`Stored group of ${group.length - failed} of ${group.length} file(s)`);
      progressReporter.addProcessed(group.length);
    } catch (error) {
      const isConnectionError =
        error.message.includes('Unable to connect') ||
        error.message.includes('fetch failed') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ECONNRESET') ||
        error.cause?.code === 'ECONNREFUSED' ||
        error.cause?.code === 'ENOTFOUND' ||
        error.cause?.code === 'ETIMEDOUT' ||
        error.cause?.code === 'ECONNRESET';

      if (isConnectionError) {
        console.error(`Failed to connect to endpoint ${url}: ${error.message}`);
        console.error('Exiting due to connection failure');
        process.exit(1);
      }

      results.failed += group.length;
      progressReporter.addProcessed(group.length);
      // The response body once for the group, and only the status for each file
      console.error(`Failed to store a group of ${group.length} file(s): ${error.message}`);
      if (error.responseText) {
        console.error(error.responseText);
      }
      group.forEach(({ filePath }) => {
        results.errors.push({ file: filePath, error: error.message });
      });
    }
  };

  const flushGroup = async () => {
    if (fileGroup.length === 0) return;

    const snapshot = fileGroup.slice();
    fileGroup.length = 0;
    currentGroupSize = 0;

    await tracker.limitUnsettled(parallel, LIMIT_UNSETTLED_TIMEOUT_MS);
    tracker.add(runOneStow(snapshot, timeoutMs));
  };

  await dirScanner(fileNames, {
    ...options,
    recursive: true,
    onError: (filename, error) => {
      results.failed++;
      results.errors.push({ file: filename, error: error.message });
    },
    callback: async filename => {
      try {
        if (filenameCheck) {
          const ext = path.extname(filename).slice(1).toLowerCase();
          if (SKIP_EXTENSIONS.has(ext)) return;
          if (filename.endsWith('DICOMDIR')) return;
        }

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

  if (!showProgress) {
    console.log('Finished starting all stow operations; awaiting remaining store promises...');
  }
  // limitUnsettled(1): resolve when unsettled count drops below 1 (i.e. 0 remaining)
  await tracker.limitUnsettled(1, WAIT_ALL_TIMEOUT_MS);

  if (showProgress) {
    progressReporter.finish();
  }
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
 * Stores multiple DICOM files to a STOW-RS endpoint in a single multipart request.
 * Uses node:http/node:https so timeout is under our control (Bun's fetch has a hardcoded 5-minute limit).
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

  // Timeout: when timeoutMs is omitted, use 24h so long uploads don't fail. node:http allows this.
  const effectiveTimeoutMs =
    timeoutMs != null && timeoutMs > 0 ? timeoutMs : 24 * 60 * 60 * 1000;
  if (timeoutMs != null && timeoutMs > 0) {
    console.noQuiet('Setting timeout for', timeoutMs, 'ms');
  }

  const url = new URL(endpointUrl);
  const isHttps = url.protocol === 'https:';
  const requestOptions = {
    method: 'POST',
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    headers: requestHeaders,
  };

  const client = isHttps ? https : http;

  const response = await new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseText = Buffer.concat(chunks).toString('utf-8');
        const responseHeaders = { ...res.headers };
        const responseLike = {
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage || '',
          headers: {
            get(name) {
              const key = Object.keys(responseHeaders).find(
                (k) => k.toLowerCase() === name.toLowerCase()
              );
              return key ? responseHeaders[key] : null;
            },
          },
        };
        resolve({ responseLike, responseText, res });
      });
      res.on('error', reject);
    });

    req.on('error', reject);

    if (effectiveTimeoutMs > 0) {
      req.setTimeout(effectiveTimeoutMs, () => {
        req.destroy(new Error(`Request timed out after ${effectiveTimeoutMs} ms`));
      });
    }

    bodyStream.pipe(req);
  });

  const { responseLike, responseText, res } = response;
  console.verbose('Server response status:', res.statusCode, res.statusMessage);
  console.verbose('Server response headers:', res.headers);
  if (responseText) {
    console.verbose('Server response body:', responseText);
  }

  if (!responseLike.ok) {
    // 409 or 503: the body lists each failed instance (PS3.18 10.5.3). The 503 of an unknown
    // result has a plain text body, and can come after some instances were stored (SQR-U5).
    if (res.statusCode === 409 || res.statusCode === 503) {
      await parseAndLogDicomJsonErrors(responseLike, responseText, files);
    }
    throw Object.assign(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''}`.trim()), {
      status: res.statusCode,
      retryAfter: responseLike.headers.get('retry-after'),
      responseText,
    });
  }

  // Parse JSON DICOM response if applicable and log errors; a 202 lists the failed instances
  responseLike.failures = await parseAndLogDicomJsonErrors(responseLike, responseText, files);

  return responseLike;
}

/**
 * Returns the wait (ms) of a Retry-After header: seconds, or an HTTP date. Bounded to
 * MAX_RETRY_AFTER_SECONDS, with DEFAULT_RETRY_AFTER_SECONDS for a missing or invalid value.
 * @param {string|null} value
 * @returns {number}
 */
function retryAfterMs(value) {
  let seconds = Number(value);
  if (value == null || value === '' || !Number.isFinite(seconds)) {
    const date = Date.parse(value ?? '');
    seconds = Number.isNaN(date) ? DEFAULT_RETRY_AFTER_SECONDS : (date - Date.now()) / 1000;
  }
  return Math.min(Math.max(seconds, 0), MAX_RETRY_AFTER_SECONDS) * 1000;
}

/**
 * stowFiles, and up to MAX_UNAVAILABLE_RETRIES more times after a 503 response, each after the
 * wait of its Retry-After header. A 503 comes from a storage outage, from too much stalled
 * work, or from an unknown result. In the last case the server can have stored some instances
 * (SQR-U5). The same group can still be sent again, because a new upload of a stored instance
 * replaces it. Same parameters as stowFiles.
 */
export async function stowFilesWithRetry(
  files,
  endpointUrl,
  additionalHeaders,
  xmlResponse,
  timeoutMs
) {
  for (let retry = 0; ; retry++) {
    try {
      return await stowFiles(files, endpointUrl, additionalHeaders, xmlResponse, timeoutMs);
    } catch (error) {
      if (error.status !== 503 || retry >= MAX_UNAVAILABLE_RETRIES) throw error;
      const waitMs = retryAfterMs(error.retryAfter);
      console.warn(
        `HTTP 503 for a group of ${files.length} file(s), retry ${retry + 1} of ${MAX_UNAVAILABLE_RETRIES} in ${waitMs / 1000} s`
      );
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
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

