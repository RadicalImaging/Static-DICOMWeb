import { async, utilities, data } from 'dcmjs';
import { writeMultipartFramesFilter } from './writeMultipartFramesFilter.mjs';
import { writeBulkdataFilter } from './writeBulkdataFilter.mjs';
import { inlineBinaryFilter } from './inlineBinaryFilter.mjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

const { AsyncDicomReader } = async;
const { DicomMetadataListener, createInformationFilter } = utilities;
const { ReadBufferStream } = data;


/**
 * Processes a DICOM stream and optionally writes multipart frames
 * 
 * @param {Stream|ReadBufferStream} stream - The DICOM stream or ReadBufferStream to process
 * @param {Object} options - Configuration options
 * @param {string} options.dicomdir - Base directory for writing files (required if DicomWebWriter is not provided)
 * @param {Function} options.DicomWebWriter - Constructor for DicomWebWriter. Defaults to FileDicomWebWriter if dicomdir is provided
 * @param {Object} options.writerOptions - Additional options to pass to the DicomWebWriter constructor
 * @param {boolean} options.bulkdata - Enable bulkdata filter (default: true if writer exists). Set to false to use frames filter instead
 * @param {number} options.sizeBulkdataTags - Size threshold in bytes for public tags (default: 128k + 2 bytes)
 * @param {number} options.sizePrivateBulkdataTags - Size threshold in bytes for private tags (default: 128 bytes)
 * @returns {Promise<{meta, dict, writer, informationFilter}>} - Parsed metadata and optional writer/filter instances
 */
export async function instanceFromStream(stream, options = {}) {
  const reader = new AsyncDicomReader();
  
  // Check if the input is a ReadBufferStream instance
  if (stream instanceof ReadBufferStream) {
    // If it's already a ReadBufferStream, use it directly
    reader.stream = stream;
  } else {
    // Otherwise, treat it as a regular stream and read from it
    await reader.stream.fromAsyncStream(stream);
  }

  // Build filters array
  const information = {} ;
  const filters = [];

  // Determine which DicomWebWriter to use
  // Default to FileDicomWebWriter if dicomdir is provided but no writer type is specified
  const DicomWebWriterClass = options.DicomWebWriter || (options.dicomdir ? FileDicomWebWriter : null);

  // Create writer using the listener's information object
  let writer = null;
  if (DicomWebWriterClass) {
    const writerOptions = options.writerOptions || { baseDir: options.dicomdir };
    writer = new DicomWebWriterClass(information, writerOptions);
  }

  // Add bulkdata filter if writer is present (activated by default)
  // Set bulkdata: false to disable and use frames filter instead
  let bulkdataFilter = null;
  const useBulkdata = writer && options.writeBulkdata !== false;
  
  if (useBulkdata) {
    bulkdataFilter = writeBulkdataFilter({
      dicomdir: options.dicomdir,
      writer,
      sizeBulkdataTags: options.sizeBulkdataTags,
      sizePrivateBulkdataTags: options.sizePrivateBulkdataTags,
    });
    filters.push(bulkdataFilter);
  }

  // Add binary multipart filter only if bulkdata is explicitly disabled
  let frameFilter = null;
  if (writer && options?.writeFrames!==false) {
    frameFilter = writeMultipartFramesFilter({
      dicomdir: options.dicomdir,
      writer,
    });
    filters.push(frameFilter);
  }

  filters.push(inlineBinaryFilter());

  // Create listener with filters
  // The listener will automatically create its own information filter and call init()
  const listener = new DicomMetadataListener({ information }, ...filters);

  const { fmi, dict } = await reader.readFile({ listener });

  console.log("Finished parsing file", information.sopInstanceUid);

  if( writer ) {
    console.log("Writing metadata to file", information.sopInstanceUid);
    const metadataStream = await writer.openInstanceStream('index.json', { gzip: true, path: '/metadata' });
    metadataStream.stream.write(Buffer.from(JSON.stringify([dict])));
    writer.closeStream(metadataStream.streamKey);
  }

  // Wait for all frame writes to complete before returning
  await writer?.awaitAllStreams();
  console.log("Finished writing metadata to file", information.sopInstanceUid);

  return { fmi, dict, writer, information: listener.information };
}
