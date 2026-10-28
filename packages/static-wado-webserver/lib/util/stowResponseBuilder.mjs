import {
  StorageUnavailableError,
  isOutOfResourcesError,
  toStorageError,
} from '@radicalimaging/static-wado-util';

const DEFAULT_FAILURE_REASON = 0xc000;
const DEFAULT_STUDY_PATH_TEMPLATE = '/api/studies/{studyInstanceUID}';

function withTrailingSlashRemoved(value) {
  return `${value || ''}`.replace(/\/+$/, '');
}

function buildStudyRetrieveUrl(studyInstanceUID, options = {}) {
  if (!studyInstanceUID) {
    return null;
  }

  const rootUrl = withTrailingSlashRemoved(options.rootUrl || '');
  const pathTemplate = options.studyPathTemplate || DEFAULT_STUDY_PATH_TEMPLATE;
  const path = pathTemplate.replace('{studyInstanceUID}', studyInstanceUID);

  if (!rootUrl) {
    return path;
  }

  return `${rootUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function resolveRetrieveUrl(studyInstanceUID, options = {}, instance = null) {
  if (typeof options.retrieveUrlBuilder === 'function') {
    return options.retrieveUrlBuilder(studyInstanceUID, instance);
  }
  return buildStudyRetrieveUrl(studyInstanceUID, options);
}

function mapSuccessSequenceItem(instance, options = {}) {
  const item = {};
  if (instance?.sopClassUID) {
    item['00081150'] = {
      vr: 'UI',
      Value: [instance.sopClassUID],
    };
  }
  if (instance?.sopInstanceUID) {
    item['00081155'] = {
      vr: 'UI',
      Value: [instance.sopInstanceUID],
    };
  }

  const retrieveUrl = resolveRetrieveUrl(instance?.studyInstanceUID, options, instance);
  if (retrieveUrl) {
    item['00081190'] = {
      vr: 'UR',
      Value: [retrieveUrl],
    };
  }

  return item;
}

function mapFailedSequenceItem(instance, options = {}) {
  const item = {};
  if (instance?.sopClassUID) {
    item['00081150'] = {
      vr: 'UI',
      Value: [instance.sopClassUID],
    };
  }
  if (instance?.sopInstanceUID) {
    item['00081155'] = {
      vr: 'UI',
      Value: [instance.sopInstanceUID],
    };
  }
  item['00081197'] = {
    vr: 'US',
    Value: [instance?.failureReason ?? options.defaultFailureReason ?? DEFAULT_FAILURE_REASON],
  };

  const errorComment =
    instance?.errorComment ||
    (Array.isArray(instance?.failureDetails) ? instance.failureDetails.join(', ') : null);
  if (errorComment) {
    item['00000902'] = {
      vr: 'LO',
      Value: [errorComment],
    };
  }

  return item;
}

/**
 * Build a STOW-RS dataset from authorized/failed instance lists.
 * Options can override status codes and RetrieveURL generation:
 * - rootUrl, studyPathTemplate
 * - retrieveUrlBuilder(studyInstanceUID, instance)
 * - successStatusCode, partialSuccessStatusCode, failureStatusCode
 * - defaultFailureReason
 */
export function createDatasetResponseFromInstances(
  authorizedInstances = [],
  failedInstances = [],
  options = {}
) {
  const response = {};

  const successItems = authorizedInstances.map(instance => mapSuccessSequenceItem(instance, options));
  if (successItems.length > 0) {
    response['00081199'] = {
      vr: 'SQ',
      Value: successItems,
    };
  }

  const failedItems = failedInstances.map(instance => mapFailedSequenceItem(instance, options));
  if (failedItems.length > 0) {
    response['00081198'] = {
      vr: 'SQ',
      Value: failedItems,
    };
  }

  if (successItems.length > 0) {
    const firstStudyInstanceUID = authorizedInstances[0]?.studyInstanceUID;
    const retrieveUrl = resolveRetrieveUrl(firstStudyInstanceUID, options, authorizedInstances[0]);
    if (retrieveUrl) {
      response['00081190'] = {
        vr: 'UR',
        Value: [retrieveUrl],
      };
    }
  }

  const statusCode = stowStatusCode(successItems.length, failedItems.length, options);
  return { statusCode, dataset: response };
}

/**
 * HTTP status of a STOW-RS response (PS3.18 Table 10.5.3-1): 200 when all instances are
 * stored, 202 when some failed, 409 when the request has instances and none is stored.
 * Options: successStatusCode, partialSuccessStatusCode, failureStatusCode.
 * @returns {number}
 */
function stowStatusCode(successCount, failedCount, options = {}) {
  if (failedCount === 0) {
    return options.successStatusCode ?? 200;
  }
  return successCount > 0
    ? (options.partialSuccessStatusCode ?? 202)
    : (options.failureStatusCode ?? 409);
}

/**
 * HTTP status for a dataset of createDatasetResponseFromUploadedFiles (see stowStatusCode).
 * @param {Object} dataset
 * @returns {number}
 */
export function getStowStatusCode(dataset, options = {}) {
  return stowStatusCode(
    dataset?.['00081199']?.Value?.length ?? 0,
    dataset?.['00081198']?.Value?.length ?? 0,
    options
  );
}

/** Failure Reasons of PS3.18 Table I.2-2 */
const OUT_OF_RESOURCES = 0xa700;
const PROCESSING_FAILURE = 0x0110;

/**
 * Returns true for a temporary storage error (a StorageUnavailableError of toStorageError).
 * @param {Error} error
 * @returns {boolean}
 */
function isStorageOutageError(error) {
  return toStorageError('', error) instanceof StorageUnavailableError;
}

/**
 * Failure Reason (0008,1197) of a failed instance (PS3.18 Table I.2-2):
 * - error.failureReason, when it is set: instanceFromStream sets C000 for data that it cannot
 *   read, and a validateInstance hook can set its own value;
 * - A700 (refused, out of resources) for a temporary storage error (toStorageError) with no
 *   free space or resources (isOutOfResourcesError);
 * - 0110 (processing failure) for each other error, because the server caused it (another
 *   storage error, a stopped instance, a timeout, a Node.js stream error).
 * @param {Error} error
 * @returns {number}
 */
export function stowFailureReason(error) {
  if (Number.isInteger(error?.failureReason)) {
    return error.failureReason;
  }
  if (isStorageOutageError(error) && isOutOfResourcesError(error)) {
    return OUT_OF_RESOURCES;
  }
  return PROCESSING_FAILURE;
}

/**
 * Returns true when the files of an upload hold no stored instance, and each failure is a
 * temporary storage error. The request then gets 503 with Retry-After (SQR-U3, SQR-U5).
 * @param {Array<{ok: boolean, cause?: Error}>} files - Files of completePostController
 * @returns {boolean}
 */
export function isStorageOutage(files = []) {
  return (
    files.length > 0 &&
    files.every(file => !file.ok && file.cause && isStorageOutageError(file.cause))
  );
}

function getSOPClassUID(information) {
  return information?.sopClassUid || null;
}

function getSOPInstanceUID(information) {
  return information?.sopInstanceUid || null;
}

export function createDatasetResponseFromUploadedFiles(files = [], options = {}) {
  const response = {};
  const successItems = [];
  const failedItems = [];

  for (const file of files) {
    const information = file.result?.information;
    const hasInformation = !!information;
    // instanceFromStream throws on a failed stream write, so file.ok covers those errors
    const isValidSuccess = file.ok && hasInformation;
    const sopClassUID = hasInformation ? getSOPClassUID(information) : null;
    const sopInstanceUID = hasInformation ? getSOPInstanceUID(information) : null;

    const item = {};
    const contentLocation = file.fieldname || file.headers?.['content-location'];
    if (contentLocation) {
      item['00091001'] = {
        vr: 'LO',
        Value: [contentLocation],
      };
    }
    if (sopClassUID) {
      item['00081150'] = {
        vr: 'UI',
        Value: [sopClassUID],
      };
    }
    if (sopInstanceUID) {
      item['00081155'] = {
        vr: 'UI',
        Value: [sopInstanceUID],
      };
    }

    if (isValidSuccess) {
      successItems.push(item);
    } else {
      // file.cause is the error of instanceFromStream (completePostController)
      const failureReason = file.cause
        ? stowFailureReason(file.cause)
        : (options.defaultFailureReason ?? DEFAULT_FAILURE_REASON);
      item['00081197'] = { vr: 'US', Value: [failureReason] };
      failedItems.push(item);
    }
  }

  if (successItems.length > 0) {
    response['00081199'] = {
      vr: 'SQ',
      Value: successItems,
    };
  }
  if (failedItems.length > 0) {
    response['00081198'] = {
      vr: 'SQ',
      Value: failedItems,
    };
  }

  return response;
}
