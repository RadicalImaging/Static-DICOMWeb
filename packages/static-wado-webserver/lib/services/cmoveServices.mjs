import dcmjsDimse from "dcmjs-dimse";
import { concatMap, takeWhile, Observable } from "rxjs";
import { createRequestFactory as createCFindRequestFactory, callbacks as cFindCallbacks } from "./cfindServices.mjs";
import { createRequestResponseObservable } from "./util/requestObservables.mjs";

const { CMoveRequest } = dcmjsDimse.requests;

/**
 * Returns a dcmjsdimse request for cmove.
 * Based on request options it decides which request to return.
 *
 * @param {Object} requestOptions Object containing request's options.
 * @returns
 * @throws {Error} in case there is no valid combination of uids (on requestOptions) that represents a request
 */
export function createRequestFactory(requestOptions) {
  const { destAeTittle, priority, bulk } = requestOptions;

  let operation;
  // auxiliary map to direct access to UID param
  // param index mapping to uid
  const refUIDMap = {
    0: "StudyInstanceUID",
    1: "SeriesInstanceUID",
    2: "SOPInstanceUID",
  };

  // index position refers to order of param on operation
  // i.e if [0, 1, 2] => op(...,StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID...)
  // list of references to UIDS. Used to get the refs UIDS on request call.
  const paramsRefs = [0, 1, 2];

  const elements = [];

  function* requests(_paramsRefs) {
    yield [CMoveRequest.createImageMoveRequest, [..._paramsRefs]]; // 0,1,2
    _paramsRefs.pop();
    yield [CMoveRequest.createSeriesMoveRequest, [..._paramsRefs]]; // 0,1
    _paramsRefs.pop();
    yield [CMoveRequest.createStudyMoveRequest, [..._paramsRefs]]; // 0
    _paramsRefs.pop();
    yield Error("There is no enough uid for cmove");
  }

  for (const request of requests(paramsRefs)) {
    const [_operation, _paramsRef] = request;

    // in case of bulk first one is not necessary
    if (bulk) {
      _paramsRef.pop();
    }

    const invalid = _paramsRef.some((ref) => !requestOptions[refUIDMap[ref]]);

    if (!invalid) {
      operation = _operation;
      _paramsRef.forEach((ref) => {
        const uid = refUIDMap[ref];
        console.log("Retrieve", ref, uid);
        // elements index ref to receive requestOptions[uid]
        elements[ref] = requestOptions[uid];
      });
      break;
    }
  }

  console.log("elements", elements, CMoveRequest);
  return operation.call(CMoveRequest, destAeTittle, ...elements, priority);
}

export const callbacks = {
  adaptResolve: (response) => response?.getDenaturalizedDataset(),
};

/**
 * Runner to stream result(s) from find request to a move request.
 * To prevent overloading dimse server the following strategy was considered:
 * - Each value emitted from source (i.e find response event) will map to move operation (which can emit one or more value).
 * - Each new value emitted from source will only be mapped to move operation if previous map is completed. It means find can occur in parallel, but not move.
 *
 * @param {*} serverOptions options for server connection.
 * @param {*} requestOptions options for request (it groups both find/move options).
 * @param {*} findRequestProp
 * @param {*} moveRequestProp
 * @returns Promise that will be resolved with find/move results
 */
async function runFindMoveRequest(serverOptions, requestOptions, findRequestProp, moveRequestProp) {
  const findResults = [];
  const moveResults = [];
  // observe find response events
  const request$ = createRequestResponseObservable(serverOptions, findRequestProp, requestOptions, [
    // turn each find response into a new move event
    // a new incoming from source will wait until previous one is completed
    concatMap((result) => {
      if (result.response.hasDataset()) {
        const findResult = findRequestProp.callbacks.adaptResolve(result.response);
        const resultToMove = findRequestProp.callbacks.adaptToNext(result.response);
        findResults.push(findResult);
        // observe move events and finish when move responses are done.
        return createRequestResponseObservable(serverOptions, moveRequestProp, resultToMove, [takeWhile((_res) => !_res.done)]);
      }

      // safely complete as there is no more findings to move because all previous one are already completed
      return new Observable((observer) => {
        observer.complete();
      });
    }),
  ]);

  return new Promise((resolve, reject) => {
    request$.subscribe({
      next: (data) => {
        try {
          const result = moveRequestProp.callbacks.adaptResolve(data.response);
          moveResults.push(result);
        } catch (e) {
          console.log("Error while trying to append moved entity");
        }
      },
      error: (err) => reject(err),
      complete: () => resolve([findResults, moveResults]),
    });
  });
}

/**
 * Find and move entities. It find a list of studies, series or instances then move them.
 *
 * It uses reactiveness to stream incoming messages and pipeline all of them into one single response.
 *
 * @param {*} serverOptions
 * @param {*} requestOptions
 * @returns Promise to resolve on moved data
 */
export const findMove = async (serverOptions, requestOptions) => {
  try {
    const findReq = {
      createRequestFactory: (reqOptions) => createCFindRequestFactory(reqOptions),
      callbacks: cFindCallbacks,
    };
    const moveReq = {
      createRequestFactory: (previousReqOptions) => createRequestFactory({ ...requestOptions, ...previousReqOptions, bulk: false }),
      callbacks,
    };

    return runFindMoveRequest(serverOptions, requestOptions, findReq, moveReq);
  } catch (e) {
    console.log("Bulk operation has failed", e);
    return undefined;
  }
};
