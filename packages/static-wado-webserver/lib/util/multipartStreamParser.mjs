import dcmjs from 'dcmjs';

const { WriteBufferStream } = dcmjs.data;

/**
 * Parses multipart/form-data header values into an object.
 * 
 * @param {string} headerString - The raw header string
 * @returns {Object} Parsed header object with lowercase keys
 */
function parseHeaders(headerString) {
  const headers = {};
  const lines = headerString.split(/\r?\n/);
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.substring(0, colonIndex).trim().toLowerCase();
    let value = line.substring(colonIndex + 1).trim();
    
    // Parse Content-Disposition header values
    if (key === 'content-disposition') {
      const disposition = {};
      const parts = value.split(';');
      disposition.type = parts[0].trim();
      
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        const eqIndex = part.indexOf('=');
        if (eqIndex === -1) continue;
        
        const attrKey = part.substring(0, eqIndex).trim();
        let attrValue = part.substring(eqIndex + 1).trim();
        
        // Remove quotes if present
        if (attrValue.startsWith('"') && attrValue.endsWith('"')) {
          attrValue = attrValue.substring(1, attrValue.length - 1);
        }
        
        disposition[attrKey] = attrValue;
      }
      
      headers[key] = disposition;
    } else {
      // Parse other headers that might have key=value pairs
      if (value.includes(';')) {
        const headerObj = {};
        const parts = value.split(';');
        headerObj.value = parts[0].trim();
        
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i].trim();
          const eqIndex = part.indexOf('=');
          if (eqIndex === -1) continue;
          
          const attrKey = part.substring(0, eqIndex).trim();
          let attrValue = part.substring(eqIndex + 1).trim();
          
          if (attrValue.startsWith('"') && attrValue.endsWith('"')) {
            attrValue = attrValue.substring(1, attrValue.length - 1);
          }
          
          headerObj[attrKey] = attrValue;
        }
        
        headers[key] = headerObj;
      } else {
        headers[key] = value;
      }
    }
  }
  
  return headers;
}

/**
 * Extracts the boundary string from the first boundary marker in the stream.
 * The boundary pattern is: --boundary\r\n
 * 
 * @param {Buffer} data - Buffer containing the start of the multipart stream
 * @returns {string|null} The boundary string or null if not found
 */
function extractBoundaryFromStream(data) {
  // Look for pattern starting with -- followed by boundary and \r\n
  // The first boundary marker should be at the start of the stream
  if (data.length < 4 || data[0] !== 0x2D || data[1] !== 0x2D) {
    // Must start with --
    return null;
  }
  
  // Find the \r\n that ends the boundary marker
  let crlfIndex = -1;
  for (let i = 2; i < data.length - 1; i++) {
    if (data[i] === 0x0D && data[i + 1] === 0x0A) {
      crlfIndex = i;
      break;
    }
  }
  
  if (crlfIndex === -1) {
    // Haven't seen the CRLF yet, need more data
    return null;
  }
  
  // Extract boundary (skip the leading -- and trailing \r\n)
  const boundaryString = data.slice(2, crlfIndex).toString('utf-8');
  return boundaryString;
}

/**
 * Creates an in-memory parser for Express.js POST file upload streams in multipart format.
 * The parser splits the upload stream by part and fires a listener callback as soon as
 * each part starts receiving data, including the multipart header data and a BufferStream instance.
 * 
 * The boundary is automatically detected from the stream separator strings, not from headers.
 * 
 * @param {Object} req - Express.js request object with a readable stream
 * @param {Function} onPart - Callback function called when a new part starts
 *                            Signature: (headers, bufferStream) => void
 * @param {Object} options - Parser options
 * @param {number} options.bufferSize - Initial buffer size for BufferStream (default: 64KB)
 * @returns {Promise<void>} Promise that resolves when parsing is complete
 */
export async function parseMultipartStream(req, onPart, options = {}) {
  const { bufferSize = 64 * 1024 } = options;
  
  let buffer = Buffer.alloc(0);
  let boundary = null;
  let boundaryMarker = null;
  let boundaryBuffer = null;
  let firstBoundaryBuffer = null;
  let endBoundaryMarker = null;
  let endBoundaryBuffer = null;
  let currentPartHeaders = null;
  let currentPartBufferStream = null;
  let inHeaders = true;
  
  // Helper to process data chunk
  const processChunk = (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    
    // First, detect boundary from stream if not already detected
    if (!boundary) {
      const detectedBoundary = extractBoundaryFromStream(buffer);
      if (!detectedBoundary) {
        // Need more data to detect boundary
        // Make sure we have enough data (at least enough for a reasonable boundary)
        if (buffer.length < 1024) {
          return false; // Wait for more data
        }
        // If we still can't detect, the stream might be malformed
        throw new Error('Unable to detect boundary from stream');
      }
      
      // Boundary detected, set up all boundary markers
      boundary = detectedBoundary;
      boundaryMarker = `--${boundary}`;
      boundaryBuffer = Buffer.from(`\r\n${boundaryMarker}`, 'utf-8');
      firstBoundaryBuffer = Buffer.from(boundaryMarker, 'utf-8');
      endBoundaryMarker = `--${boundary}--`;
      endBoundaryBuffer = Buffer.from(`\r\n${endBoundaryMarker}`, 'utf-8');
      
      // Skip past the first boundary marker (--boundary\r\n)
      const firstBoundaryEnd = buffer.indexOf(Buffer.from('\r\n', 'utf-8'), 2) + 2;
      if (firstBoundaryEnd < 2) {
        throw new Error('Malformed first boundary marker');
      }
      buffer = buffer.slice(firstBoundaryEnd);
    }
    
    // Helper to find boundary in buffer (defined after boundary is detected)
    const findBoundary = (data, startIndex = 0) => {
      // Check for end boundary first
      const endIdx = data.indexOf(endBoundaryBuffer, startIndex);
      if (endIdx !== -1) {
        return { type: 'end', index: endIdx };
      }
      
      // Check for regular boundary
      const boundaryIdx = data.indexOf(boundaryBuffer, startIndex);
      if (boundaryIdx !== -1) {
        return { type: 'boundary', index: boundaryIdx };
      }
      
      // Check for first boundary (at the start)
      if (startIndex === 0) {
        const firstIdx = data.indexOf(firstBoundaryBuffer);
        if (firstIdx === 0) {
          return { type: 'first', index: 0 };
        }
      }
      
      return null;
    };
    
    while (buffer.length > 0) {
      if (inHeaders) {
        // Look for end of headers (double CRLF)
        const headerEnd = buffer.indexOf('\r\n\r\n', 0);
        if (headerEnd === -1) {
          // Check if we have enough data to potentially contain a boundary
          // If buffer is too large, we might have missed the header end
          if (buffer.length > 8192) {
            throw new Error('Header too large or malformed');
          }
          // Need more data
          break;
        }
        
        // Extract header portion
        const headerBytes = buffer.slice(0, headerEnd);
        const headerString = headerBytes.toString('utf-8');
        
        // Parse headers (boundary markers have already been skipped)
        currentPartHeaders = parseHeaders(headerString);
        
        // Create new WriteBufferStream for this part
        currentPartBufferStream = new WriteBufferStream(bufferSize);
        
        // Fire the listener callback with headers and BufferStream
        onPart(currentPartHeaders, currentPartBufferStream);
        
        // Skip past headers (headerEnd + 4 for \r\n\r\n)
        buffer = buffer.slice(headerEnd + 4);
        inHeaders = false;
        
        continue;
      }
      
      // We're in the body of a part, look for next boundary or end
      const boundaryInfo = findBoundary(buffer, 0);
      
      if (!boundaryInfo) {
        // No boundary found yet, need to be careful:
        // We need to keep the last N bytes (where N = max boundary length)
        // to handle boundaries that span chunks
        const maxBoundaryLength = Math.max(
          boundaryBuffer.length,
          endBoundaryBuffer.length,
          firstBoundaryBuffer.length
        );
        
        if (buffer.length > maxBoundaryLength) {
          // Write all but the last maxBoundaryLength bytes to the part stream
          const writeLength = buffer.length - maxBoundaryLength;
          const toWrite = buffer.slice(0, writeLength);
          currentPartBufferStream.addBuffer(toWrite.buffer.slice(toWrite.byteOffset, toWrite.byteOffset + toWrite.byteLength));
          buffer = buffer.slice(writeLength);
        } else {
          // Not enough data, wait for more
          break;
        }
      } else {
        // Found a boundary
        if (boundaryInfo.type === 'end') {
          // End of multipart data
          // Write data before boundary to current part
          const beforeBoundary = buffer.slice(0, boundaryInfo.index);
          // Remove trailing CRLF before boundary
          const actualBodyEnd = beforeBoundary.length >= 2 && 
            beforeBoundary[beforeBoundary.length - 2] === 0x0D &&
            beforeBoundary[beforeBoundary.length - 1] === 0x0A
            ? beforeBoundary.length - 2
            : beforeBoundary.length;
          
          if (actualBodyEnd > 0) {
            const bodyData = beforeBoundary.slice(0, actualBodyEnd);
            currentPartBufferStream.addBuffer(bodyData.buffer.slice(bodyData.byteOffset, bodyData.byteOffset + bodyData.byteLength));
          }
          
          // Mark stream as complete
          if (currentPartBufferStream) {
            currentPartBufferStream.setComplete();
          }
          
          // Done parsing
          return true;
        } else {
          // Regular boundary - end of current part, start of new part
          const beforeBoundary = buffer.slice(0, boundaryInfo.index);
          
          // Remove trailing CRLF before boundary
          const actualBodyEnd = beforeBoundary.length >= 2 && 
            beforeBoundary[beforeBoundary.length - 2] === 0x0D &&
            beforeBoundary[beforeBoundary.length - 1] === 0x0A
            ? beforeBoundary.length - 2
            : beforeBoundary.length;
          
          // Write body data before boundary to current part
          if (actualBodyEnd > 0 && currentPartBufferStream) {
            const bodyData = beforeBoundary.slice(0, actualBodyEnd);
            currentPartBufferStream.addBuffer(bodyData.buffer.slice(bodyData.byteOffset, bodyData.byteOffset + bodyData.byteLength));
          }
          
          // Mark current part stream as complete
          if (currentPartBufferStream) {
            currentPartBufferStream.setComplete();
          }
          
          // Move buffer past the boundary
          let skipLength = boundaryInfo.index + boundaryBuffer.length;
          if (boundaryInfo.type === 'first') {
            skipLength = firstBoundaryBuffer.length;
          }
          
          buffer = buffer.slice(skipLength);
          
          // Skip optional CRLF after boundary
          if (buffer.length >= 2 && buffer[0] === 0x0D && buffer[1] === 0x0A) {
            buffer = buffer.slice(2);
          }
          
          // Reset for next part
          inHeaders = true;
          currentPartHeaders = null;
          currentPartBufferStream = null;
        }
      }
    }
    
    return false;
  };
  
  // Process the stream
  return new Promise((resolve, reject) => {
    let isDone = false;
    
    req.on('data', (chunk) => {
      if (isDone) return;
      
      try {
        const done = processChunk(chunk);
        if (done) {
          isDone = true;
          resolve();
        }
      } catch (error) {
        isDone = true;
        reject(error);
      }
    });
    
    req.on('end', () => {
      if (isDone) return;
      
      try {
        // Process any remaining buffer
        if (buffer.length > 0) {
          if (inHeaders) {
            reject(new Error('Unexpected end of stream while parsing headers'));
            return;
          }
          
          // Write remaining data to current part
          if (currentPartBufferStream && buffer.length > 0) {
            currentPartBufferStream.addBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
          }
          
          // Mark stream as complete
          if (currentPartBufferStream) {
            currentPartBufferStream.setComplete();
          }
        }
        
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    
    req.on('error', (error) => {
      if (isDone) return;
      isDone = true;
      reject(error);
    });
  });
}