import { async, utilities } from 'dcmjs';
import { writeMultipartFramesFilter } from './writeMultipartFramesFilter.mjs';
import { FileDicomWebWriter } from './FileDicomWebWriter.mjs';

const { AsyncDicomReader } = async;
const { DicomMetadataListener, createInformationFilter } = utilities;


/**
 * Processes a DICOM stream and optionally writes multipart frames
 * 
 * @param {Stream} stream - The DICOM stream to process
 * @param {Object} options - Configuration options
 * @param {string} options.dicomdir - Base directory for writing files (required if DicomWebWriter is not provided)
 * @param {Function} options.DicomWebWriter - Constructor for DicomWebWriter. Defaults to FileDicomWebWriter if dicomdir is provided
 * @param {Object} options.writerOptions - Additional options to pass to the DicomWebWriter constructor
 * @returns {Promise<{meta, dict, writer, informationFilter}>} - Parsed metadata and optional writer/filter instances
 */
export async function instanceFromStream(stream, options = {}) {
  const reader = new AsyncDicomReader();
  await reader.stream.fromAsyncStream(stream);

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

  // Add binary multipart filter if needed
  let frameFilter = null;
  if (writer) {
    frameFilter = writeMultipartFramesFilter({
      dicomdir: options.dicomdir,
      writer,
    });
    filters.push(frameFilter);
  }

  // Create listener with filters
  // The listener will automatically create its own information filter and call init()
  const listener = new DicomMetadataListener({ information }, ...filters);

  const { meta, dict } = await reader.readFile({ listener });

  // Wait for all frame writes to complete before returning
  await writer?.awaitAllStreams();

  return { meta, dict, writer, information: listener.information };
}
