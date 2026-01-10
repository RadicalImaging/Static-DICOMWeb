import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

/**
 * DICOM tag hex values for UIDs
 */
const TAGS = {
    StudyInstanceUID: '0020000D',
    SeriesInstanceUID: '0020000E',
    SOPInstanceUID: '00080018'
};

/**
 * Get a value from DICOM metadata dict by tag
 * @param {Object} dict - DICOM metadata dictionary
 * @param {string} tag - Tag hex string (e.g., '0020000D')
 * @returns {string|undefined} - First value in the Value array, or undefined
 */
function getTagValue(dict, tag) {
    const tagData = dict[tag];
    if (tagData?.Value && Array.isArray(tagData.Value) && tagData.Value.length > 0) {
        return tagData.Value[0];
    }
    return undefined;
}

/**
 * Filter for DicomMetadataListener that writes gzipped instance JSON metadata
 * to dicomdir/studies/<studyUID>/series/<seriesUID>/instances/<sopUID>/metadata.gz
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.dicomdir - Base directory path where metadata files will be written
 * @returns {Object} Filter object with pop method
 */
export function writeInstanceMetadataFilter(options = {}) {
    const { dicomdir } = options;
    
    if (!dicomdir) {
        throw new Error('dicomdir option is required for writeInstanceMetadataFilter');
    }

    // Track if we've already written the metadata (to avoid writing multiple times)
    let metadataWritten = false;
    // Track the root dict object to detect when we're popping the root
    let rootDict = null;

    /**
     * Writes gzipped JSON metadata to the appropriate path
     * @param {Object} dict - Complete DICOM metadata dictionary
     */
    async function writeMetadata(dict) {
        // Avoid writing multiple times if called multiple times
        if (metadataWritten) {
            return;
        }

        // Extract UIDs from the metadata
        const studyUID = getTagValue(dict, TAGS.StudyInstanceUID);
        const seriesUID = getTagValue(dict, TAGS.SeriesInstanceUID);
        const sopUID = getTagValue(dict, TAGS.SOPInstanceUID);

        // Validate that we have all required UIDs
        if (!studyUID || !seriesUID || !sopUID) {
            console.warn(
                'Missing required UIDs for metadata write:',
                { studyUID, seriesUID, sopUID }
            );
            return;
        }

        // Build the output path: dicomdir/studies/<studyUID>/series/<seriesUID>/instances/<sopUID>/metadata.gz
        const outputPath = path.join(
            dicomdir,
            'studies',
            studyUID,
            'series',
            seriesUID,
            'instances',
            sopUID,
            'metadata.gz'
        );

        try {
            // Ensure all parent directories exist
            const outputDir = path.dirname(outputPath);
            await fsPromises.mkdir(outputDir, { recursive: true });

            // Convert dict to JSON string
            const jsonString = JSON.stringify(dict, null, 2);
            const jsonBuffer = Buffer.from(jsonString, 'utf-8');

            // Gzip the buffer
            const gzippedBuffer = await gzipAsync(jsonBuffer);

            // Write the gzipped buffer to file
            await fsPromises.writeFile(outputPath, gzippedBuffer);

            console.warn(`Written instance metadata to ${outputPath} (${jsonBuffer.length} bytes -> ${gzippedBuffer.length} bytes gzipped)`);
            metadataWritten = true;
        } catch (error) {
            console.error(`Error writing instance metadata to ${outputPath}:`, error);
        }
    }

    /**
     * Filter method: Called when starting a new object.
     * We track when the root object is started so we can detect when it's popped.
     */
    function startObject(next, dest) {
        // If this is the root object (current is null before startObject), track it
        // We check this.current === null because the root object has no parent
        if (dest && this.current === null && rootDict === null) {
            rootDict = dest;
        }
        return next(dest);
    }

    /**
     * Filter method: Called when popping values from the stack.
     * When we pop the root object, we write the metadata.
     */
    function pop(next) {
        // Call next first to get the result and update the listener's state
        const result = next();

        // Check if we've popped back to the root:
        // 1. this.current is null (we've popped beyond the root)
        // 2. result is the rootDict we tracked
        // 3. We haven't written yet
        if (
            this.current === null &&
            result === rootDict &&
            result &&
            typeof result === 'object' &&
            !metadataWritten
        ) {
            // We're at the root level and have the complete metadata dict
            // Write it asynchronously (fire and forget)
            writeMetadata(result).catch(error => {
                console.error('Error in writeInstanceMetadataFilter:', error);
            });
        }

        return result;
    }

    return {
        startObject,
        pop
    };
}