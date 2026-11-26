import {
  fileToKey,
  mapBulkDataUris,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import { errorResponse } from '../handle.mjs';
import { firstPart, storeParts, storedResponse } from './parts.mjs';

export const instanceDir = ({ studyUID, seriesUID, sopUID }) =>
  `studies/${studyUID}/series/${seriesUID}/instances/${sopUID}`;

/**
 * Bulkdata miss (D7): the stored metadata names `<instance>/bulkdata/<tagpath>`, from the
 * instance and the tag path of the upstream BulkDataURI (also `7FE00008` and `7FE00009`). The
 * handler finds the URI of that instance and tag path in the upstream metadata of the instance,
 * gets the bulkdata, and stores it as multipart at that key.
 * shortcut: a URI that only the metadata of another instance holds gives 404; read the referring
 * metadata when an upstream needs it.
 */
export async function bulkdata(route, request, context) {
  const { studyUID, seriesUID, sopUID, tagPath } = route;
  const [metadata] = await context.upstream.retrieveMetadata(studyUID, seriesUID, sopUID);
  let uri;
  if (metadata) {
    mapBulkDataUris(metadata, value => {
      if (value.endsWith(`/instances/${sopUID}/bulkdata/${tagPath}`)) {
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
