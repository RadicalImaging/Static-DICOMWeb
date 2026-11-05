import {
  fileToKey,
  mapBulkDataUris,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import { errorResponse } from '../handle.mjs';
import { firstPart, storeParts, storedResponse } from './parts.mjs';

const instanceDir = ({ studyUID, seriesUID, sopUID }) =>
  `studies/${studyUID}/series/${seriesUID}/instances/${sopUID}`;

/**
 * Bulkdata miss (D7): the stored metadata names `<instance>/bulkdata/<tagpath>`, from the tag
 * path of the upstream BulkDataURI. The handler finds that URI in the upstream instance
 * metadata, gets the bulkdata, and stores it as multipart at that key.
 */
export async function bulkdata(route, request, context) {
  const { studyUID, seriesUID, sopUID, tagPath } = route;
  const [metadata] = await context.upstream.retrieveMetadata(studyUID, seriesUID, sopUID);
  let uri;
  if (metadata) {
    mapBulkDataUris(metadata, value => {
      if (value.endsWith(`/bulkdata/${tagPath}`)) {
        uri = value;
      }
      return value;
    });
  }
  if (!uri) {
    return errorResponse({ status: 404 });
  }
  const part = await firstPart(await context.upstream.retrieveBulkData(uri));
  return storedResponse(
    await storeParts(context.store, `${instanceDir(route)}/bulkdata/${tagPath}`, [part])
  );
}

/**
 * Part 10 miss: the instance in its stored transfer syntax (`transfer-syntax=*`), stored in the
 * form that `create-dicomweb` writes (`<instance>/index.mht.gz`).
 */
export async function part10(route, request, context) {
  const { studyUID, seriesUID, sopUID } = route;
  const part = await firstPart(
    await context.upstream.retrieveInstance(studyUID, seriesUID, sopUID)
  );
  return storedResponse(
    await storeParts(
      context.store,
      fileToKey(`${instanceDir(route)}/index.mht.gz`),
      [{ ...part, contentType: 'application/dicom' }],
      'gzip'
    )
  );
}
