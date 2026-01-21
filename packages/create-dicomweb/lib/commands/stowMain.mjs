import fs from "fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { dirScanner } from '@radicalimaging/static-wado-util';

/**
 * Stores DICOM files to a STOW-RS endpoint
 * @param {string|string[]} fileNames - File(s) or directory(ies) to process
 * @param {Object} options - Options object
 * @param {string} options.url - URL endpoint for STOW-RS storage
 * @param {Object} [options.headers] - Additional HTTP headers to include
 * @param {number} [options.maxGroupSize] - Maximum size in bytes for grouping files (default: 10MB)
 * @param {boolean} [options.sendAsSingleFiles] - If true, send each file individually instead of grouping (default: false)
 */
export async function stowMain(fileNames, options = {}) {
    const { url, headers = {}, maxGroupSize = 10 * 1024 * 1024, sendAsSingleFiles = false } = options; // Default 10MB
    
    if (!url) {
        throw new Error('url option is required');
    }

    const results = {
        success: 0,
        failed: 0,
        errors: []
    };

    // If sendAsSingleFiles is true, send each file individually
    if (sendAsSingleFiles) {
        await dirScanner(fileNames, { 
            ...options, 
            recursive: true, 
            callback: async (filename) => {
                try {
                    await stowFile(filename, url, headers);
                    results.success++;
                    console.log(`Stored: ${filename}`);
                } catch (error) {
                    results.failed++;
                    results.errors.push({ file: filename, error: error.message });
                    console.error(`Failed to store ${filename}: ${error.message}`);
                }
            }
        });
    } else {
        // Group files by size
        const fileGroup = [];
        let currentGroupSize = 0;

        const flushGroup = async () => {
            if (fileGroup.length === 0) return;

            try {
                await stowFiles(fileGroup, url, headers);
                results.success += fileGroup.length;
                console.log(`Stored group of ${fileGroup.length} file(s)`);
            } catch (error) {
                results.failed += fileGroup.length;
                fileGroup.forEach(({ filePath }) => {
                    results.errors.push({ file: filePath, error: error.message });
                    console.error(`Failed to store ${filePath}: ${error.message}`);
                });
            }

            fileGroup.length = 0;
            currentGroupSize = 0;
        };

        await dirScanner(fileNames, { 
            ...options, 
            recursive: true, 
            callback: async (filename) => {
                try {
                    const stats = fs.statSync(filename);
                    const fileSize = stats.size;

                    // If adding this file would exceed the group size, flush the current group
                    if (fileGroup.length > 0 && currentGroupSize + fileSize > maxGroupSize) {
                        await flushGroup();
                    }

                    // If a single file exceeds the group size, send it individually
                    if (fileSize > maxGroupSize) {
                        try {
                            await stowFile(filename, url, headers);
                            results.success++;
                            console.log(`Stored: ${filename}`);
                        } catch (error) {
                            results.failed++;
                            results.errors.push({ file: filename, error: error.message });
                            console.error(`Failed to store ${filename}: ${error.message}`);
                        }
                    } else {
                        // Add file to current group
                        fileGroup.push({ filePath: filename, fileSize });
                        currentGroupSize += fileSize;
                    }
                } catch (error) {
                    results.failed++;
                    results.errors.push({ file: filename, error: error.message });
                    console.error(`Failed to process ${filename}: ${error.message}`);
                }
            }
        });

        // Flush any remaining files in the group
        await flushGroup();
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
 * Stores a single DICOM file to a STOW-RS endpoint
 * @param {string} filePath - Path to the DICOM file
 * @param {string} endpointUrl - URL endpoint for STOW-RS storage
 * @param {Object} additionalHeaders - Additional HTTP headers to include
 */
export async function stowFile(filePath, endpointUrl, additionalHeaders = {}) {
    // Boundary should NOT include dashes - the multipart format adds "--" automatically
    // Standard format: boundary="abc123", body uses "--abc123\r\n"
    const boundary = `StaticWadoBoundary${randomUUID()}`;
    const contentType = `multipart/related; type="application/dicom"; boundary=${boundary}`;
    
    const fileName = path.basename(filePath);
    
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    // Create streaming multipart body
    const { bodyStream, contentLength } = createMultipartBodyStreamSingle({
        filePath,
        boundary,
        fileName,
        fileSize,
    });
    
    // Prepare headers
    const requestHeaders = {
        'Content-Type': contentType,
        'Content-Length': contentLength.toString(),
        ...additionalHeaders
    };

    // Send POST request
    const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: requestHeaders,
        // Node.js fetch requires duplex for streaming request bodies.
        // Safe to include even if the runtime ignores it.
        duplex: 'half',
        body: bodyStream
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    return response;
}

/**
 * Stores multiple DICOM files to a STOW-RS endpoint in a single multipart request
 * @param {Array<{filePath: string, fileSize: number}>} files - Array of file objects with path and size
 * @param {string} endpointUrl - URL endpoint for STOW-RS storage
 * @param {Object} additionalHeaders - Additional HTTP headers to include
 */
export async function stowFiles(files, endpointUrl, additionalHeaders = {}) {
    if (files.length === 0) {
        return;
    }

    // If only one file, use the single file method
    if (files.length === 1) {
        return await stowFile(files[0].filePath, endpointUrl, additionalHeaders);
    }

    const boundary = `StaticWadoBoundary${randomUUID()}`;
    const contentType = `multipart/related; type="application/dicom"; boundary=${boundary}`;
    
    // Create streaming multipart body with multiple files
    const { bodyStream, contentLength } = createMultipartBodyStreamMultiple(files, boundary);
    
    // Prepare headers
    const requestHeaders = {
        'Content-Type': contentType,
        'Content-Length': contentLength.toString(),
        ...additionalHeaders
    };

    // Send POST request
    const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: requestHeaders,
        duplex: 'half',
        body: bodyStream
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
    }

    return response;
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

/**
 * Creates a multipart/related body for STOW-RS request
 * @param {fs.ReadStream} fileStream - Stream of the DICOM file
 * @param {string} boundary - Multipart boundary
 * @param {string} fileName - Name of the file
 * @returns {Promise<Buffer>} Complete multipart body as buffer
 */
function createMultipartBodyStreamSingle({ filePath, boundary, fileName, fileSize }) {
    const headerStr = multipartPartHeader(boundary, fileName, true);
    const footerStr = `\r\n--${boundary}--\r\n`;

    const contentLength =
        Buffer.byteLength(headerStr, 'utf-8') +
        fileSize +
        Buffer.byteLength(footerStr, 'utf-8');

    async function* gen() {
        yield Buffer.from(headerStr, 'utf-8');
        const fileStream = fs.createReadStream(filePath);
        for await (const chunk of fileStream) {
            yield chunk;
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
