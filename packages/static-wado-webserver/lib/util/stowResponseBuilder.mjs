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

  let statusCode = options.successStatusCode ?? 200;
  if (failedItems.length > 0 && successItems.length > 0) {
    statusCode = options.partialSuccessStatusCode ?? 202;
  } else if (failedItems.length > 0 && successItems.length === 0) {
    statusCode = options.failureStatusCode ?? 409;
  }

  return { statusCode, dataset: response };
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
    const streamErrors = file.result?.streamErrors || [];
    const hasStreamErrors = streamErrors.length > 0;
    const isValidSuccess = file.ok && hasInformation && !hasStreamErrors;
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
      if (hasStreamErrors) {
        const logger = options.logger ?? console;
        logger.error(
          `[STOW] Instance ${sopInstanceUID || 'unknown'} failed due to stream errors:`,
          streamErrors.map(e => `${e.streamKey}: ${e.error?.message || e.error}`).join(', ')
        );
      }
      item['00081197'] = {
        vr: 'US',
        Value: [options.defaultFailureReason ?? DEFAULT_FAILURE_REASON],
      };
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
