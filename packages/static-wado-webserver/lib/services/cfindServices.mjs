import dcmjsDimse from "dcmjs-dimse";
import dcmjs from "dcmjs";

const { CFindRequest } = dcmjsDimse.requests;
const { DicomMetaDictionary } = dcmjs.data;

/**
 * Returns a dcmjsdimse request for cfind.
 * Based on request options it decides which request to return.
 *
 * @param {Object} requestOptions Object containing request's options.
 * @returns
 * @throws {Error} in case there is no valid combination of uids (on requestOptions) that represents a request
 */
export function createRequestFactory(requestOptions) {
  const { bulk, priority } = requestOptions;

  let operation;

  // auxiliary map to direct access to UID param
  // param index mapping to uid
  const refUIDMap = {
    0: "SOPInstanceUID",
    1: "SeriesInstanceUID",
    2: "StudyInstanceUID",
  };

  // list of references to UIDS. Used to get the refs UIDS on request call.
  const paramsRefs = [0, 1, 2];

  const elements = {
    PatientName: "*",
    StudyInstanceUID: "*",
    SeriesInstanceUID: "*",
    SOPInstanceUID: "*",
  };

  function* requests(_paramsRefs) {
    yield [CFindRequest.createImageFindRequest, [..._paramsRefs]];
    _paramsRefs.shift();
    yield [CFindRequest.createSeriesFindRequest, [..._paramsRefs]];
    _paramsRefs.shift();
    yield [CFindRequest.createStudyFindRequest, [..._paramsRefs]];
    yield Error("There is no enough uid for cfind");
  }

  for (const request of requests(paramsRefs)) {
    const [_operation, _paramsRef] = request;

    // in case of bulk first one is not necessary
    if (bulk) {
      _paramsRef.shift();
    }

    const invalid = _paramsRef.some((ref) => !requestOptions[refUIDMap[ref]]);

    if (!invalid) {
      delete elements.PatientName;
      operation = _operation;
      _paramsRef.forEach((ref) => {
        const uid = refUIDMap[ref];
        elements[uid] = requestOptions[uid];
      });
      break;
    }
  }

  return operation?.call(CFindRequest, elements, priority);
}

export const callbacks = {
  // adapt data in case this will be outputted (responded).
  adaptResolve: (response) => {
    const elements = response?.getDataset()?.getElements() || {};

    return DicomMetaDictionary.denaturalizeDataset(elements);
  },
  // adapt data to next operation
  adaptToNext: (response) => response?.getDataset().getElements(),
};
