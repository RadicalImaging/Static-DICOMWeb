import { selectTargetSyntax } from '@dcmjs/commands/pixel';
import {
  rewriteBulkDataUris,
  splitSeriesMetadata,
} from '@radicalimaging/static-wado-util/storageFormat/index.mjs';
import { errorResponse } from '../handle.mjs';
import { storeJson } from './storeJson.mjs';

/**
 * Removes the group 0002 (file meta) elements, which DICOMweb metadata must not hold, and
 * writes AvailableTransferSyntaxUID (0008,3002) when the upstream gives a transfer syntax
 * (PRX-IMP-16, D6): the destination of the compression rule when the rule recompresses, else
 * the upstream syntax. The upstream (0008,3002) wins over (0002,0010).
 * @param {Object[]} metadata
 * @param {Object[]} [rules] - The rule table of the configuration; default `DEFAULT_RULES`
 */
export const withoutFileMeta = (metadata, rules) =>
  metadata.map(instance => {
    const transferSyntax = instance['00083002']?.Value?.[0] ?? instance['00020010']?.Value?.[0];
    const result = Object.fromEntries(
      Object.entries(instance).filter(([tag]) => !tag.startsWith('0002'))
    );
    if (transferSyntax) {
      const { target } = selectTargetSyntax(result, {
        incomingTransferSyntax: transferSyntax,
        rules,
      });
      result['00083002'] = { vr: 'UI', Value: [target ?? transferSyntax] };
    }
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
  const metadata = withoutFileMeta(
    await context.upstream.retrieveMetadata(studyUID, seriesUID),
    context.config.rules
  );
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
    await context.upstream.retrieveMetadata(studyUID, seriesUID, sopUID),
    context.config.rules
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
