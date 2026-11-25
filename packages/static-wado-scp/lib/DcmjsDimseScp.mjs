import fs from 'fs';
import { Stats, Tags, aeConfig } from '@radicalimaging/static-wado-util';
import StaticWado from '@radicalimaging/static-wado-creator';
import dcmjsDimse from 'dcmjs-dimse';
import dcmjs from 'dcmjs';
import { loadedPlugins } from './loadPlugins.mjs';
import RawBytesDataset from './RawBytesDataset.mjs';
import {
  writeRetrieveFiles,
  sendSubOperations,
  finalRetrieveStatus,
  identifierError,
  RetrieveStatus,
} from './retrieve.mjs';

const { Scp, Dataset, Client } = dcmjsDimse;
const { CEchoResponse, CStoreResponse, CFindResponse, CGetResponse, CMoveResponse } =
  dcmjsDimse.responses;
const { Status, PresentationContextResult, SopClass, StorageClass } = dcmjsDimse.constants;

const PreferredTransferSyntax = [
  '1.2.840.10008.1.2.4.80',
  '1.2.840.10008.1.2.4.81',
  '1.2.840.10008.1.2.4.100',
  '1.2.840.10008.1.2.4.101',
  '1.2.840.10008.1.2.4.102',
  '1.2.840.10008.1.2.4.103',
  '1.2.840.10008.1.2.4.70',
  '1.2.840.10008.1.2.5',
  '1.2.840.10008.1.2.4.50',
  '1.2.840.10008.1.2.1',
  '1.2.840.10008.1.2',
];

// The SCP cannot transcode an image into a video syntax (MPEG-2, MPEG-4), so a C-GET
// accepts a video syntax only for a video SOP class. A C-GET prefers Explicit VR Little
// Endian, so that a lossy stored instance is not transcoded to a larger lossless syntax.
const VideoSopClass = [
  '1.2.840.10008.5.1.4.1.1.77.1.1.1', // Video Endoscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.2.1', // Video Microscopic Image Storage
  '1.2.840.10008.5.1.4.1.1.77.1.4.1', // Video Photographic Image Storage
];
const VideoTransferSyntax = [
  '1.2.840.10008.1.2.4.100',
  '1.2.840.10008.1.2.4.101',
  '1.2.840.10008.1.2.4.102',
  '1.2.840.10008.1.2.4.103',
];
const ExplicitVRLittleEndian = '1.2.840.10008.1.2.1';
const GetStorageTransferSyntax = [
  ExplicitVRLittleEndian,
  ...PreferredTransferSyntax.filter(
    tsuid => tsuid !== ExplicitVRLittleEndian && !VideoTransferSyntax.includes(tsuid)
  ),
];

// TODO - make this come from the command line setup to allow for custom settings
const defaultParams = {
  isInstance: false,
  isGroup: true,
  isDeduplicate: true,
  isStudyData: true,
};

let staticParams = {};

class DcmjsDimseScp extends Scp {
  constructor(socket, opts = staticParams) {
    super(socket, opts);
    console.log('opts=', opts);
    this.association = undefined;
    this.importer = new StaticWado(opts);
    this.options = opts;
    // The C-GET sub-operations that wait for a response on this association
    this.pendingRequests = new Set();
    this.on('close', () => this.connectionClosed());
  }

  /**
   * Ends the pending C-GET sub-operations and closes the importer when the
   * connection closes, also after an abort or a network error.
   */
  connectionClosed() {
    this.closed = true;
    for (const request of this.pendingRequests) request.raiseDoneEvent();
    this.pendingRequests.clear();
    this.importer?.close();
    this.importer = null;
  }

  // dcmjs-dimse closes the connection after an A-ABORT; connectionClosed cleans up
  abort(source, reason) {
    console.log('Association aborted, source', source, 'reason', reason);
  }

  // Handle incoming association requests
  associationRequested(association) {
    this.association = association;
    // // Evaluate calling/called AET and reject association, if needed
    // if (this.association.getCallingAeTitle() !== 'SCU') {
    //   this.sendAssociationReject(
    //     RejectResult.Permanent,
    //     RejectSource.ServiceUser,
    //     RejectReason.CallingAeNotRecognized
    //   );
    //   return;
    // }

    // Optionally set the preferred max PDU length
    this.association.setMaxPduLength(65536);

    const contexts = association.getPresentationContexts();
    // On a C-GET association the SCP sends on the storage contexts
    const isGet = contexts.some(
      c =>
        association.getPresentationContext(c.id).getAbstractSyntaxUid() ===
        SopClass.StudyRootQueryRetrieveInformationModelGet
    );
    try {
      contexts.forEach(c => {
        const context = association.getPresentationContext(c.id);
        const isStorage = Object.values(StorageClass).includes(context.getAbstractSyntaxUid());
        const preferred =
          isGet && isStorage && !VideoSopClass.includes(context.getAbstractSyntaxUid())
            ? GetStorageTransferSyntax
            : PreferredTransferSyntax;
        if (
          context.getAbstractSyntaxUid() === SopClass.Verification ||
          context.getAbstractSyntaxUid() === SopClass.StudyRootQueryRetrieveInformationModelFind ||
          context.getAbstractSyntaxUid() === SopClass.StudyRootQueryRetrieveInformationModelGet ||
          context.getAbstractSyntaxUid() === SopClass.StudyRootQueryRetrieveInformationModelMove ||
          isStorage
        ) {
          const transferSyntaxes = context.getTransferSyntaxUids();
          const transferSyntax = preferred.find(tsuid =>
            transferSyntaxes.find(contextTsuid => contextTsuid === tsuid)
          );
          if (transferSyntax) {
            context.setResult(PresentationContextResult.Accept, transferSyntax);
          } else {
            console.log(
              'Rejected syntax',
              context.getAbstractSyntaxUid(),
              'because no transfer syntax found in',
              transferSyntaxes
            );
            context.setResult(PresentationContextResult.RejectTransferSyntaxesNotSupported);
          }
        } else {
          console.log('Not supported abstract syntax', context.getAbstractSyntaxUid());
          context.setResult(PresentationContextResult.RejectAbstractSyntaxNotSupported);
        }
      });
    } catch (e) {
      console.log('Caught', e);
      throw e;
    }
    this.sendAssociationAccept();
  }

  // Handle incoming C-ECHO requests

  cEchoRequest(request, callback) {
    const response = CEchoResponse.fromRequest(request);
    response.setStatus(Status.Success);

    callback(response);
  }

  /**
   * Handle incoming C-Find request by converting the incoming request into a studyQuery, or into a seriesQuery etc.
   *
   * @param {*} request
   * @param {*} callback
   */
  cFindRequest(request, callback) {
    const dataset = request.getDataset();
    const { QueryRetrieveLevel } = dataset.elements;
    console.log('QueryRetrieveLevel', QueryRetrieveLevel);
    // TODO - call loadPlugins pon the given level to see if they can be loaded
    const queryFunc = loadedPlugins[QueryRetrieveLevel];

    if (queryFunc && !this.cfindDisabled) {
      queryFunc(dataset.elements)
        .then(results => {
          const datasets = results.map(item => {
            if (item.elements) return item.elements;
            const match = { ...item };
            // The dedupped block is the deduplication bookkeeping of this store
            Tags.removePrivateBlock(match, '0009', Tags.DeduppedCreator);
            return dcmjs.data.DicomMetaDictionary.naturalizeDataset(match);
          });
          const responses = datasets.map(item => {
            const pendingResponse = CFindResponse.fromRequest(request);
            pendingResponse.setDataset(new Dataset(item));
            pendingResponse.setStatus(Status.Pending);
            return pendingResponse;
          });

          const finalResponse = CFindResponse.fromRequest(request);
          finalResponse.setStatus(Status.Success);
          responses.push(finalResponse);

          callback(responses);
        })
        .catch(reason => {
          console.log('Failed because', reason);
          const failureResponse = CFindResponse.fromRequest(request);
          failureResponse.setStatus(Status.ProcessingFailure);
          callback([failureResponse]);
        });
    } else {
      console.log('No query function');
      const failureResponse = CFindResponse.fromRequest(request);
      failureResponse.setStatus(Status.ProcessingFailure);
      callback([failureResponse]);
    }
  }

  // Handle incoming C-STORE requests
  cStoreRequest(request, callback) {
    try {
      const importDs = request.getDataset().getDenaturalizedDataset();
      const response = CStoreResponse.fromRequest(request);
      const params = {
        ...defaultParams,
        TransferSyntaxUID: request.dataset.transferSyntaxUid,
      };

      this.importer
        .importBinaryDicom(importDs, params)
        .then(() => {
          response.setStatus(Status.Success);
          Stats.StudyStats.add('Receive DICOM', `Receive DICOM instance`);
          callback(response);
        })
        .catch(rejected => {
          console.log('Rejected because:', rejected);
          response.setStatus(0xc001);

          callback(response);
        });
    } catch (e) {
      console.log('Caught cStoreRequest error', e);
      throw e;
    }
  }

  /**
   * Keeps the received C-STORE bytes as they arrive, so that the importer
   * reads the data without a decode and an encode in dcmjs-dimse.
   */
  createDatasetFromStoreWritableStream(writable, acceptedPresentationContext, callback) {
    callback(
      new RawBytesDataset(
        writable.toBuffer(),
        acceptedPresentationContext.getAcceptedTransferSyntaxUid()
      )
    );
  }

  /**
   * Runs the C-STORE sub-operations of a C-GET or C-MOVE, sends a Pending
   * response after each sub-operation, and gives the final response.
   *
   * @param {Request} request - The C-GET or C-MOVE request.
   * @param {Function} Response - CGetResponse or CMoveResponse.
   * @param {function(CStoreRequest[]): void} send - Queues the sub-operations.
   * @param {function(Response): void} callback - Gets the final response.
   */
  async retrieve(request, Response, send, callback) {
    const respond = (status, counts) => {
      const response = Response.fromRequest(request);
      response.setStatus(status);
      response.setRemaining(counts.remaining);
      response.setCompleted(counts.completed);
      response.setFailures(counts.failed);
      response.setWarnings(counts.warnings);
      return response;
    };
    const none = { remaining: 0, completed: 0, failed: 0, warnings: 0 };
    const identifier = request.getDataset().getElements();
    const problem = identifierError(identifier);
    if (problem) {
      console.log('Retrieve refused:', problem);
      callback(respond(RetrieveStatus.IdentifierDoesNotMatchSopClass, none));
      return;
    }
    let retrieved;
    try {
      retrieved = await writeRetrieveFiles(this.options.rootDir, identifier);
    } catch (e) {
      console.log('Retrieve failed because', e.message);
      callback(respond(RetrieveStatus.UnableToPerformSubOperations, none));
      return;
    }
    try {
      const counts = await sendSubOperations(
        retrieved.files,
        send,
        progress => {
          if (progress.remaining && !this.closed) {
            this.sendResponse(request, respond(Status.Pending, progress));
          }
        },
        retrieved.failed
      );
      if (!this.closed) callback(respond(finalRetrieveStatus(counts), counts));
    } catch (e) {
      // For example a bad aeConfig port: Client.send throws in place of a networkError
      console.log('Retrieve failed because', e.message);
      if (!this.closed) callback(respond(RetrieveStatus.UnableToPerformSubOperations, none));
    } finally {
      await fs.promises
        .rm(retrieved.dir, { recursive: true, force: true })
        .catch(e => console.warn('Cannot remove', retrieved.dir, e.message));
    }
  }

  // Handle incoming C-GET requests: the sub-operations use this association
  cGetRequest(request, callback) {
    const send = requests => {
      const sendable = [];
      for (const r of requests) {
        // dcmjs-dimse skips a request with no accepted context and never raises 'done'
        if (!this.association.getAcceptedPresentationContextFromRequest(r)) {
          r.raiseDoneEvent();
          continue;
        }
        this.pendingRequests.add(r);
        r.on('done', () => this.pendingRequests.delete(r));
        sendable.push(r);
      }
      if (sendable.length) this.sendRequests(sendable);
    };
    this.retrieve(request, CGetResponse, send, callback);
  }

  // Handle incoming C-MOVE requests: the sub-operations use a new association
  cMoveRequest(request, callback) {
    const destination = request.getCommandDataset().getElement('MoveDestination');
    const ae = aeConfig[destination];
    if (!ae) {
      console.log('Unknown move destination', destination);
      const response = CMoveResponse.fromRequest(request);
      response.setStatus(RetrieveStatus.MoveDestinationUnknown);
      callback(response);
      return;
    }
    const send = requests => {
      const client = new Client();
      requests.forEach(r => client.addRequest(r));
      // A failed association never sends the requests, so mark each one done
      const fail = e => {
        console.log('Move to', destination, 'failed because', e?.message || e);
        requests.forEach(r => r.raiseDoneEvent());
      };
      client.on('networkError', fail);
      client.on('associationRejected', fail);
      // A request without a response when the destination closes is a failure
      client.on('closed', () => requests.forEach(r => r.raiseDoneEvent()));
      client.send(ae.host, ae.port, this.association.getCalledAeTitle(), destination);
    };
    this.retrieve(request, CMoveResponse, send, callback);
  }

  // Handle incoming association release requests
  associationReleaseRequested() {
    this.importer.close();
    this.importer = null;
    this.sendAssociationReleaseResponse();
  }
}

DcmjsDimseScp.setParams = params => {
  staticParams = params;
};

export default DcmjsDimseScp;
