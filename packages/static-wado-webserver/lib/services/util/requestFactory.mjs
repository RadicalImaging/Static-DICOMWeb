import dcmjsDimse from "dcmjs-dimse";

const { Client } = dcmjsDimse;

/**
 * Returns an array with the request and client connections.
 * Wrapper to create a new request operation on given client.
 *
 * @param {*} serverOptions options to connect server.
 * @param {*} request DcmjsDimse request object.
 * @returns
 */
export default function requestFactory(serverOptions, request) {
  const { aeTittle, host, port, opts = {} } = serverOptions;

  const client = new Client();

  client.addRequest(request);
  client.send(host, port, aeTittle, aeTittle, opts);

  return [request, client];
}
