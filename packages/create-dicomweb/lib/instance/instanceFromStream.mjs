import { async, utilities } from 'dcmjs';
import { writeMultipartFramesFilter } from './writeMultipartFramesFilter.js';

const { AsyncDicomReader } = async;
const { DicomMetadataListener } = utilities;

export async function instanceFromStream(stream, options = {}) {
  const reader = new AsyncDicomReader();
  await reader.stream.fromAsyncStream(stream);
  
  // Create filters array
  const filters = [];
  
  // Add binary multipart filter if dicomdir is specified
  if (options.dicomdir) {
    filters.push(writeMultipartFramesFilter({
      dicomdir: options.dicomdir
    }));
  }
  
  const listener = new DicomMetadataListener(...filters);
  const { meta, dict } = await reader.readFile(listener);
  // console.warn('FMI:', JSON.stringify(meta, null, 2));
  // console.warn('Dict:', JSON.stringify(dict, null, 2));
}
