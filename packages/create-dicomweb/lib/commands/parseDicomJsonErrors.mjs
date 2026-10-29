import fs from "fs";
import path from 'path';
import { async, utilities } from 'dcmjs';

const { AsyncDicomReader } = async;
const { DicomMetadataListener } = utilities;

/** Private tag (0009,1001) Content-Location - the Content-Location of the multipart part, for matching response to uploaded files */
const CONTENT_LOCATION_TAG = '00091001';

/**
 * Returns the Content-Location of part `index` of a STOW-RS request: the base name of the
 * file with the part number in front. It is unique in the request, also for files with the
 * same base name in different directories, so the response can name each file.
 *
 * The base name is encoded with encodeURIComponent, so the value is ASCII. The server reads
 * the part headers as Latin-1, and a name that is not ASCII would then not match its echo.
 * @param {number} index - The index of the part, from 0
 * @param {string} filePath
 * @returns {string}
 */
export function partContentLocation(index, filePath) {
    return `${index + 1}-${encodeURIComponent(path.basename(filePath))}`;
}

/**
 * Returns the parsed body of a DICOM JSON response, or null when the body is empty, XML, or
 * not a JSON object
 * @param {Response} response
 * @param {string} responseText
 * @returns {Object|null}
 */
function readDicomJsonBody(response, responseText) {
    if (!responseText) {
        return null;
    }
    const contentType = response.headers.get('content-type') || '';
    const isJsonDicom = contentType.includes('application/dicom+json') || contentType.includes('application/json');
    const isXmlDicom = contentType.includes('application/dicom+xml') || contentType.includes('application/xml') || contentType.includes('text/xml');
    if (isXmlDicom || !isJsonDicom) {
        return null;
    }
    try {
        const body = JSON.parse(responseText);
        return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    } catch {
        return null;
    }
}

/**
 * Returns the failures of a 202 response that the Failed SOP Sequence does not list: one for
 * each file that the response does not list as stored (SQR-U5), for example a part that the
 * server did not start after a storage error stopped the upload (SQR-D21).
 *
 * A file is stored only when an item of the Referenced SOP Sequence (0008,1199) has the
 * Content-Location of its part (`contentLocation`, see partContentLocation). When an item
 * has no such value (for example a different server), the number of items gives the number
 * of stored files, and the failures do not name a file. A body that is not DICOM JSON
 * lists no stored file, so each file of the group is failed.
 * @param {Response} response
 * @param {string} responseText
 * @param {Array<{filePath: string, contentLocation: string}>} files
 * @param {number} failedCount - The number of failures of parseAndLogDicomJsonErrors
 * @returns {Array<{file: string, error: string}>}
 */
export function filesNotListedAsStored(response, responseText, files, failedCount) {
    const body = readDicomJsonBody(response, responseText);
    const locationOf = item => item?.[CONTENT_LOCATION_TAG]?.Value?.[0];
    const storedItems = body?.['00081199']?.Value ?? [];
    const storedLocations = new Set(storedItems.map(locationOf));
    const failedLocations = new Set((body?.['00081198']?.Value ?? []).map(locationOf));
    const storedFiles = files.filter(({ contentLocation }) => storedLocations.has(contentLocation));
    // Each stored item names a different file of the group
    const named = storedFiles.length === storedItems.length;
    const storedCount = Math.min(storedItems.length, files.length);
    const missing = Math.max(files.length - storedCount - failedCount, 0);
    const error = body
        ? 'HTTP 202, no item in the response'
        : 'HTTP 202, the response does not list the stored instances';
    const listed = location => storedLocations.has(location) || failedLocations.has(location);
    const failures = named
        ? files
              .filter(({ contentLocation }) => !listed(contentLocation))
              .slice(0, missing)
              .map(({ filePath }) => ({ file: filePath, error }))
        : [];
    while (failures.length < missing) {
        failures.push({ file: `a file of a group of ${files.length} file(s)`, error });
    }
    return failures;
}

/**
 * Parses a JSON DICOM response and logs warnings for any items that are not COMPLETED, matched to uploaded file names
 * @param {Response} response - The fetch response object
 * @param {string} responseText - The response text content
 * @param {Array<{filePath: string, fileSize: number, contentLocation: string}>} files - Array of uploaded files
 * @returns {Promise<Array<{file: string, error: string}>>} One entry for each item of the
 *   Failed SOP Sequence, with the matched file path. Empty when the body is not DICOM JSON.
 */
export async function parseAndLogDicomJsonErrors(response, responseText, files) {
    const failures = [];
    const jsonResponse = readDicomJsonBody(response, responseText);
    if (!jsonResponse) {
        return failures;
    }

    try {
        // Extract FailedSOPSequence (00081198) if present
        const failedSequence = jsonResponse['00081198'];
        const failedItems = failedSequence?.Value || [];

        // If no failed items, nothing to log
        if (failedItems.length === 0) {
            return failures;
        }

        // Extract SOP Instance UIDs from uploaded files using AsyncDicomReader
        // Only do this if we have failed items to process
        const fileSopInstanceUids = await Promise.all(
            files.map(async ({ filePath }) => {
                try {
                    const reader = new AsyncDicomReader();
                    const fileStream = fs.createReadStream(filePath);
                    await reader.stream.fromAsyncStream(fileStream);
                    
                    // Use DicomMetadataListener to extract SOP Instance UID
                    const information = {};
                    const listener = new DicomMetadataListener({ information });
                    
                    await reader.readFile({ listener });
                    
                    return { filePath, sopInstanceUid: information.sopInstanceUid || null };
                } catch (error) {
                    // If we can't read the file, return null for SOP Instance UID
                    // We'll fall back to position-based matching
                    return { filePath, sopInstanceUid: null };
                }
            })
        );

        // Match response items to files and log warnings
        for (let i = 0; i < failedItems.length; i++) {
          const failedItem = failedItems[i];

          // Extract Failure Reason (00081197) if available
          const failureReasonTag = failedItem['00081197'];
          const failureReason = failureReasonTag?.Value?.[0];

          // Build the warning message
          let warningMessage = 'Failed';
          if (failureReason !== undefined) {
            // Failure reason is typically a US (unsigned short) error code
            // Convert to hex for readability if it's a number
            if (typeof failureReason === 'number') {
              warningMessage = `Failure Reason: 0x${failureReason.toString(16).toUpperCase()}`;
            } else {
              warningMessage = `Failure Reason: ${failureReason}`;
            }
          }

          // Match by Content-Location first (private tag 00091001) - most reliable for failed invalid DICOM
          // Server includes the multipart Content-Location (unique for each part) so we can match to uploaded files
          const responseContentLocation = failedItem[CONTENT_LOCATION_TAG]?.Value?.[0];
          let matchedFile = null;

          if (responseContentLocation) {
            matchedFile = files.find(
              ({ contentLocation }) => contentLocation === responseContentLocation
            );
            if (matchedFile) matchedFile = { filePath: matchedFile.filePath };
          }

          // Try SOP Instance UID (ReferencedSOPInstanceUID 00081155) if Content-Location didn't match
          if (!matchedFile) {
            const responseSopInstanceUid = failedItem['00081155']?.Value?.[0];
            if (responseSopInstanceUid) {
              matchedFile = fileSopInstanceUids.find(
                ({ sopInstanceUid }) => sopInstanceUid === responseSopInstanceUid
              );
            }
          }

          // Fall back to position-based matching - unreliable when multiple files with mixed success/failure
          if (!matchedFile && i < files.length) {
            matchedFile = { filePath: files[i].filePath };
          }

          // Log warning at noQuiet level
          if (matchedFile) {
            console.noQuiet(`Warning for file ${matchedFile.filePath}: ${warningMessage}`);
          } else {
            console.noQuiet(`Warning for uploaded file (index ${i}): ${warningMessage}`);
          }
          failures.push({
            file: matchedFile?.filePath ?? `uploaded file (index ${i})`,
            error: warningMessage,
          });
        }
    } catch (error) {
        // If parsing fails, silently ignore (response might not be JSON DICOM format)
        // The response body is already logged above
    }
    return failures;
}
