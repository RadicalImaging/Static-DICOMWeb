import fs from "fs";
import { async, utilities } from 'dcmjs';

const { AsyncDicomReader } = async;
const { DicomMetadataListener } = utilities;

/**
 * Parses a JSON DICOM response and logs warnings for any items that are not COMPLETED, matched to uploaded file names
 * @param {Response} response - The fetch response object
 * @param {string} responseText - The response text content
 * @param {Array<{filePath: string, fileSize: number}>} files - Array of uploaded files
 */
export async function parseAndLogDicomJsonErrors(response, responseText, files) {
    // Only process if we have response text
    if (!responseText) {
        return;
    }

    // Check content type to determine if it's parseable JSON DICOM response
    const contentType = response.headers.get('content-type') || '';
    const isJsonDicom = contentType.includes('application/dicom+json') || contentType.includes('application/json');
    const isXmlDicom = contentType.includes('application/dicom+xml') || contentType.includes('application/xml') || contentType.includes('text/xml');
    
    // Skip XML responses
    if (isXmlDicom) {
        return;
    }
    
    // Only process JSON DICOM responses
    if (!isJsonDicom) {
        return;
    }

    try {
        // Parse JSON response
        const jsonResponse = JSON.parse(responseText);
        
        // Check if it's a valid DICOM JSON response (should be an array)
        if (!Array.isArray(jsonResponse)) {
            return;
        }

        // Check for any items that are not COMPLETED
        const nonCompletedItems = [];
        for (let i = 0; i < jsonResponse.length; i++) {
            const responseItem = jsonResponse[i];
            const statusTag = responseItem['00400252'];
            const status = statusTag?.Value?.[0];
            if (status && status !== 'COMPLETED') {
                nonCompletedItems.push({ index: i, responseItem, status });
            }
        }

        // If all items are completed, nothing to log
        if (nonCompletedItems.length === 0) {
            return;
        }

        // Extract SOP Instance UIDs from uploaded files using AsyncDicomReader
        // Only do this if we have non-completed items to process
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
        for (const { index: i, responseItem, status } of nonCompletedItems) {
            // Extract error message from tag 00404002 if available
            const errorTag = responseItem['00404002'];
            const errorMessage = errorTag?.Value?.[0];
            
            // Build the warning message
            let warningMessage = `Status: ${status}`;
            if (errorMessage) {
                warningMessage += ` - ${errorMessage}`;
            }
            
            // Try to match by SOP Instance UID first
            const responseSopInstanceUid = responseItem['00080018']?.Value?.[0];
            let matchedFile = null;
            
            if (responseSopInstanceUid) {
                matchedFile = fileSopInstanceUids.find(
                    ({ sopInstanceUid }) => sopInstanceUid === responseSopInstanceUid
                );
            }
            
            // Fall back to position-based matching if SOP Instance UID match failed
            if (!matchedFile && i < files.length) {
                matchedFile = { filePath: files[i].filePath };
            }
            
            // Log warning at noQuiet level
            if (matchedFile) {
                console.noQuiet(`Warning for file ${matchedFile.filePath}: ${warningMessage}`);
            } else {
                console.noQuiet(`Warning for uploaded file (index ${i}): ${warningMessage}`);
            }
        }
    } catch (error) {
        // If parsing fails, silently ignore (response might not be JSON DICOM format)
        // The response body is already logged above
    }
}
