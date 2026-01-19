import crypto from 'crypto';
import { constants } from 'dcmjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

const { TagHex, BULKDATA_VRS } = constants;

/**
 * Determines if a DICOM tag is a private tag
 * Private tags have an odd group number (first 4 hex digits)
 * @param {string} tag - DICOM tag in hex format (e.g., '00100010')
 * @returns {boolean}
 */
function isPrivateTag(tag) {
  if (!tag || tag.length !== 8) return false;
  const groupNumber = parseInt(tag.substring(0, 4), 16);
  return (groupNumber & 1) === 1; // Odd group number = private
}

/**
 * Generates a hash-based path for bulkdata content
 * @param {ArrayBuffer|Buffer|Array} data - The binary data to hash
 * @returns {string} - Hash-based filename
 */
function generateHashPath(data) {
  const hash = crypto.createHash('sha256');
  
  if (Array.isArray(data)) {
    // Hash each array element
    for (const element of data) {
      if (element instanceof ArrayBuffer) {
        hash.update(Buffer.from(element));
      } else if (Buffer.isBuffer(element)) {
        hash.update(element);
      }
    }
  } else if (data instanceof ArrayBuffer) {
    hash.update(Buffer.from(data));
  } else if (Buffer.isBuffer(data)) {
    hash.update(data);
  }
  
  const digest = hash.digest('hex');
  // Create a hierarchical path structure: first 2 chars / next 2 chars / rest
  return `${digest.substring(0, 2)}/${digest.substring(2, 4)}/${digest.substring(4)}.mht`;
}

/**
 * Calculates the size of data (binary, text, or other types)
 * Handles nested arrays recursively
 * @param {*} value - The value to measure
 * @returns {number} - Approximate size in bytes
 */
function calculateDataSize(value) {
  // Null or undefined
  if (value === null) return 2;
  if (value === undefined) return 0;
  
  // Arrays - recurse through elements
  if (Array.isArray(value)) {
    let totalSize = 0;
    for (const element of value) {
      totalSize += calculateDataSize(element); // Recursive call for nested arrays
    }
    return totalSize;
  }
  
  // ArrayBuffer
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  
  // Buffer (Node.js)
  if (Buffer.isBuffer(value)) {
    return value.length;
  }
  
  // Uint8Array and other TypedArrays
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  
  // String - use string length as approximation
  if (typeof value === 'string') {
    return value.length;
  }
  
  // Number - approximate as 4 bytes
  if (typeof value === 'number') {
    return 4;
  }
  
  // Boolean - 2 bytes
  if (typeof value === 'boolean') {
    return 2;
  }
  
  // Default for other types
  return 4;
}

/**
 * Filter for DicomMetadataListener that writes large binary data to bulkdata files
 *
 * @param {Object} options - Configuration options
 * @param {string} options.dicomdir - Base directory path where bulkdata files will be written
 * @param {FileDicomWebWriter} options.writer - Optional writer instance
 * @param {number} options.sizeBulkdataTags - Size threshold in bytes for public tags (default: 128k + 2 bytes)
 * @param {number} options.sizePrivateBulkdataTags - Size threshold in bytes for private tags (default: 128 bytes)
 * @returns {Object} Filter object with value and pop methods
 */
export function writeBulkdataFilter(options = {}) {
  const { 
    dicomdir, 
    writer: providedWriter,
    sizeBulkdataTags = 131074, // 128k + 2 bytes default
    sizePrivateBulkdataTags = 128 // 128 bytes default
  } = options;

  // If no writer is provided, dicomdir is required for creating one
  if (!providedWriter && !dicomdir) {
    throw new Error('Either writer or dicomdir option is required for writeBulkdataFilter');
  }

  // Use the provided writer or create one lazily
  let writer = providedWriter || null;

  /**
   * Gets or creates the writer, using the listener's information
   * @param {Object} listener - The DicomMetadataListener instance (accessed via 'this')
   * @returns {FileDicomWebWriter}
   */
  function getWriter(listener) {
    if (!writer && listener.information) {
      writer = new FileDicomWebWriter(listener.information, { baseDir: dicomdir });
    }
    return writer;
  }

  /**
   * Filter method: Called when a tag is added
   * Returns expectsRaw: true if this tag qualifies for bulkdata based on VR, length, and threshold
   */
  function addTag(next, tag, tagInfo) {
    const result = next(tag, tagInfo) || {};
    
    // Get tag info from result or tagInfo
    const vr = result?.vr || tagInfo?.vr;
    const length = tagInfo?.length;
    const level = this.current?.level ?? 0;
    
    // Check if this tag could qualify for bulkdata
    // Never request raw for top-level PixelData (handled by frame writer)
    if (tag === TagHex.PixelData && level <= 2) {
      return result;
    }
    
    // Only request raw data if:
    // 1. VR is appropriate for bulkdata
    // 2. Length is present
    // 3. Length exceeds the appropriate threshold
    if (!vr || !BULKDATA_VRS.has(vr) || length === undefined || length === null) {
      return result;
    }
    
    // Determine if this is a private tag
    const isPrivate = isPrivateTag(tag);
    const threshold = isPrivate ? sizePrivateBulkdataTags : sizeBulkdataTags;
    
    // Only request raw data if the length exceeds the threshold
    if (length >= threshold) {
      return { ...result, expectsRaw: true };
    }
    
    return result;
  }

  /**
   * Filter method: Called when a tag is being closed (popped from stack)
   * Determines if the tag should be written as bulkdata and performs the write
   */
  function pop(next, result) {
    // Access the current tag context
    const current = this.current;
    const currentTag = current?.tag;
    const currentVR = current?.vr;
    const level = current?.level ?? 0;
    const dest = current?.dest;

    // Check if this tag has a Value array and is eligible for bulkdata
    if (!Array.isArray(dest?.Value) || !BULKDATA_VRS.has(currentVR)) {
      return next(result);
    }

    // Never capture top-level PixelData - that's handled by the frame writer
    if (currentTag === TagHex.PixelData && level <= 2) {
      return next(result);
    }

    // Determine if this is a private tag
    const isPrivate = isPrivateTag(currentTag);
    const threshold = isPrivate ? sizePrivateBulkdataTags : sizeBulkdataTags;

    // Calculate the total size of all values
    const totalSize = dest.length ?? calculateDataSize(dest.Value);

    // If total size is below threshold, don't convert to bulkdata
    if (totalSize < threshold) {
      return next(result);
    }

    // Get the writer
    const bulkdataWriter = getWriter(this);
    if (!bulkdataWriter) {
      console.warn('Writer not available, information not yet populated');
      return next(result);
    }

    // Check if StudyInstanceUID is available
    const studyUID = bulkdataWriter.getStudyUID();
    if (!studyUID) {
      // StudyInstanceUID not yet available, skip bulkdata conversion
      return next(result);
    }

    // Generate hash-based path from the entire Value array
    const hashPath = generateHashPath(dest.Value);

    // Capture the Value array before we delete it
    const valueArray = dest.Value;

    // Check if the Value array contains only ArrayBuffers or Buffers
    const isWritableData = valueArray.every(value => 
      value instanceof ArrayBuffer || Buffer.isBuffer(value)
    );

    // Replace Value array with BulkDataURI immediately (synchronously)
    delete dest.Value;
    dest.BulkDataURI = `../../../../bulkdata/${hashPath}.gz`;

    // Only write bulkdata file if the value is an array of ArrayBuffers or Buffers
    if (!isWritableData) {
      console.warn(`Skipping bulkdata write for tag ${currentTag}: not an array of ArrayBuffers/Buffers`);
      return next(result);
    }

    // Write the bulkdata file asynchronously (don't await here)
    (async () => {
      try {
        const relativePath = `studies/${studyUID}/bulkdata/${hashPath.substring(0, hashPath.lastIndexOf('/'))}`;
        const filename = hashPath.substring(hashPath.lastIndexOf('/') + 1);

        // Determine content type based on VR
        let contentType = 'application/octet-stream';
        if (currentVR === 'OB') contentType = 'application/octet-stream';
        else if (currentVR === 'OW') contentType = 'application/octet-stream';

        // Generate a unique boundary for multipart
        const boundary = `BOUNDARY_${crypto.randomUUID()}`;
        
        // Build Content-Type header
        const contentTypeHeader = `${contentType}`;

        // Open the stream with multipart wrapping
        const streamInfo = await bulkdataWriter.openStream(relativePath, filename, {
          multipart: true,
          contentType: contentTypeHeader,
          boundary,
          gzip: true,
          streamKey: `bulkdata:${currentTag}@${level}:${hashPath}`
        });

        // Write each ArrayBuffer or Buffer to the stream
        for (const value of valueArray) {
          if (value instanceof ArrayBuffer) {
            const buffer = Buffer.from(value);
            streamInfo.stream.write(buffer);
          } else if (Buffer.isBuffer(value)) {
            streamInfo.stream.write(value);
          }
        }

        // Close the stream
        await bulkdataWriter.closeStream(streamInfo.streamKey);

      } catch (error) {
        console.error(`Error writing bulkdata for tag ${currentTag}:`, error);
      }
    })();

    // Always call next with the result (synchronously)
    return next(result);
  }

  return {
    addTag,
    pop,
    getWriter: () => writer,
  };
}
