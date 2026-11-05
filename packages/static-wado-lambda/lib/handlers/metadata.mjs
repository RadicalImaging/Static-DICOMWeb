import {
  rewriteBulkDataUris,
  splitSeriesMetadata,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import { errorResponse } from '../handle.mjs';
import { storeJson } from './storeJson.mjs';

/**
 * Removes the group 0002 (file meta) elements, which DICOMweb metadata must not hold, and
 * keeps the stored transfer syntax of the upstream as AvailableTransferSyntaxUID (0008,3002)
 * (PRX-IMP-16). The upstream (0008,3002) wins over (0002,0010).
 */
export const withoutFileMeta = metadata =>
  metadata.map(instance => {
    const transferSyntax = instance['00083002']?.Value?.[0] ?? instance['00020010']?.Value?.[0];
    const result = Object.fromEntries(
      Object.entries(instance).filter(([tag]) => !tag.startsWith('0002'))
    );
    if (transferSyntax) result['00083002'] = { vr: 'UI', Value: [transferSyntax] };
    return result;
  });

/**
 * Series metadata miss (PRX-IMP-6, PRX-IMP-27): gets the series metadata from the upstream,
 * rewrites the BulkDataURI values (PRX-USR-3), and stores the series metadata and the
 * metadata of each instance, in the files that `create-dicomweb` writes:
 * `studies/<s>/series/<x>/metadata.gz` and `.../instances/<sop>/metadata.gz`.
 * Returns the series metadata. An empty upstream answer is 404.
 */
export async function seriesMetadata({ studyUID, seriesUID }, request, context) {
  const metadata = withoutFileMeta(await context.upstream.retrieveMetadata(studyUID, seriesUID));
  if (!metadata.length) {
    return errorResponse({ status: 404 });
  }
  const dir = `studies/${studyUID}/series/${seriesUID}`;
  return storeJson(context.store, [
    [`${dir}/metadata.gz`, rewriteBulkDataUris(metadata, 'series')],
    ...splitSeriesMetadata(metadata).map(instance => [
      `${dir}/instances/${instance.sopInstanceUID}/metadata.gz`,
      instance.metadata,
    ]),
  ]);
}

/**
 * Instance metadata miss: the same as `seriesMetadata` for one instance, stored in
 * `studies/<s>/series/<x>/instances/<sop>/metadata.gz`.
 */
export async function instanceMetadata({ studyUID, seriesUID, sopUID }, request, context) {
  const metadata = withoutFileMeta(
    await context.upstream.retrieveMetadata(studyUID, seriesUID, sopUID)
  );
  if (!metadata.length) {
    return errorResponse({ status: 404 });
  }
  return storeJson(context.store, [
    [
      `studies/${studyUID}/series/${seriesUID}/instances/${sopUID}/metadata.gz`,
      rewriteBulkDataUris(metadata, 'instance'),
    ],
  ]);
}
