import dcmjsDimse from "dcmjs-dimse";
import { fromEvent, map, takeUntil, race } from "rxjs";
import requestFactory from "./requestFactory.mjs";

const { Status } = dcmjsDimse.constants;

// TODO move to common place
/**
 * Constants hardcoded from (private) dcmjs-dimse event names
 */
const NET_EVENT_NAMES = {
  CLOSED: "closed",
  NETWORK_ERROR: "networkError",
};

const REQUEST_EVENT_NAMES = {
  RESPONSE: "response",
};

/**
 * Returns an observable from request's response events.
 * It will emit until there is any race conditional such as network's closed or error event
 * @param {*} serverOptions
 * @param {*} requestProp Object containing request properties, such as callbacks and createRequestFactory
 * @param {*} requestOptions Object containing request options
 * @returns
 */
export function fromResponseEvent(serverOptions, requestProp, requestOptions) {
  const _request = requestProp.createRequestFactory(requestOptions);
  const [requestEntity, clientEntity] = requestFactory(serverOptions, _request);

  const closed$ = fromEvent(clientEntity, NET_EVENT_NAMES.CLOSED);
  const networkError$ = fromEvent(clientEntity, NET_EVENT_NAMES.NETWORK_ERROR);

  return fromEvent(requestEntity, REQUEST_EVENT_NAMES.RESPONSE).pipe(takeUntil(race(closed$, networkError$)));
}

/**
 * Returns an observable based on request's response events.
 * Each observable pipes the given pipeOperations list.
 *
 * @param {*} serverOptions
 * @param {*} requestProp
 * @param {*} requestOptions Object containing request options
 * @param {*} pipeOperations
 * @returns
 */
export function createRequestResponseObservable(serverOptions, requestProp, requestOptions = {}, pipeOperations = []) {
  return fromResponseEvent(serverOptions, requestProp, requestOptions).pipe(
    map((response) => ({
      response,
      done: response.getStatus() === Status.Success,
    })),
    ...pipeOperations
  );
}
