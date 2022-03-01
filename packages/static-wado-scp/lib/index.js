const { Stats } = require("@ohif/static-wado-util");
const StaticWado = require("@ohif/static-wado-creator");
const dcmjsDimse = require("dcmjs-dimse");
const dcmjs = require("dcmjs");
const ConfigPoint = require("config-point");
require("@ohif/static-wado-plugins");
const dicomWebScpConfig = require("./dicomWebScpConfig");

const { Server, Scp, Dataset } = dcmjsDimse;
const { CEchoResponse, CStoreResponse, CFindResponse } = dcmjsDimse.responses;
const { Status, PresentationContextResult, SopClass, StorageClass } = dcmjsDimse.constants;
const cpImportPlugin = ConfigPoint.importPlugin;

const importPlugin = (name) => cpImportPlugin(name, (key) => import(key));

const PreferredTransferSyntax = [
  "1.2.840.10008.1.2.4.80",
  "1.2.840.10008.1.2.4.81",
  "1.2.840.10008.1.2.4.100",
  "1.2.840.10008.1.2.4.101",
  "1.2.840.10008.1.2.4.102",
  "1.2.840.10008.1.2.4.103",
  "1.2.840.10008.1.2.4.70",
  "1.2.840.10008.1.2.5",
  "1.2.840.10008.1.2.4.50",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2",
];

const loadedPlugins = {};

const loadPlugins = (options) => {
  const { studyQuery } = options;
  console.log("Using study query", studyQuery);
  return importPlugin(studyQuery)
    .then((value) => {
      const theImport = value.default || value;
      loadedPlugins.STUDY = theImport.generator(options);
    })
    .catch((reason) => {
      console.log("Unable to load plugin because", reason);
      // eslint-disable-next-line no-process-exit
      process.exit(-1);
    });
};

class DcmjsDimseScp extends Scp {
  constructor(socket, opts = {}) {
    super(socket, opts);
    this.association = undefined;
    this.importer = new StaticWado(opts);
    this.options = opts;
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
    try {
      contexts.forEach((c) => {
        const context = association.getPresentationContext(c.id);
        if (
          context.getAbstractSyntaxUid() === SopClass.Verification ||
          context.getAbstractSyntaxUid() === SopClass.StudyRootQueryRetrieveInformationModelFind ||
          Object.values(StorageClass).includes(context.getAbstractSyntaxUid())
        ) {
          const transferSyntaxes = context.getTransferSyntaxUids();
          const transferSyntax = PreferredTransferSyntax.find((tsuid) => transferSyntaxes.find((contextTsuid) => contextTsuid === tsuid));
          if (transferSyntax) {
            context.setResult(PresentationContextResult.Accept, transferSyntax);
          } else {
            console.log("Rejected syntax", context.getAbstractSyntaxUid(), "because no transfer syntax found in", transferSyntaxes);
            context.setResult(PresentationContextResult.RejectTransferSyntaxesNotSupported);
          }
        } else {
          console.log("Not supported abstract syntax", context.getAbstractSyntaxUid());
          context.setResult(PresentationContextResult.RejectAbstractSyntaxNotSupported);
        }
      });
    } catch (e) {
      console.log("Caught", e);
      throw e;
    }
    this.sendAssociationAccept();
  }

  // Handle incoming C-ECHO requests
  /* eslint-disable-next-line class-methods-use-this */
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
    console.log("QueryRetrieveLevel", QueryRetrieveLevel);
    const queryFunc = loadedPlugins[QueryRetrieveLevel];

    if (queryFunc && !this.cfindDisabled) {
      queryFunc(dataset.elements)
        .then((results) => {
          const datasets = results.map((item) => {
            if (item.elements) return item.elements;
            return dcmjs.data.DicomMetaDictionary.naturalizeDataset(item);
          });
          const responses = datasets.map((item) => {
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
        .catch((reason) => {
          console.log("Failed because", reason);
          const failureResponse = CFindResponse.fromRequest(request);
          failureResponse.setStatus(Status.ProcessingFailure);
          callback([failureResponse]);
        });
    } else {
      console.log("No query function");
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
        TransferSyntaxUID: request.dataset.transferSyntaxUid,
      };

      this.importer
        .importBinaryDicom(importDs, params)
        .then(() => {
          response.setStatus(Status.Success);
          Stats.StudyStats.add("Receive DICOM", `Receive DICOM instance`);
          callback(response);
        })
        .catch((rejected) => {
          console.log("Rejected because:", rejected);
          response.setStatus(0xc001);

          callback(response);
        });
    } catch (e) {
      console.log("Caught cStoreRequest error", e);
      throw e;
    }
  }

  // Handle incoming association release requests
  associationReleaseRequested() {
    this.importer.close();
    this.importer = null;
    this.sendAssociationReleaseResponse();
  }
}

exports.dicomWebScpConfig = dicomWebScpConfig;
exports.DcmjsDimseScp = DcmjsDimseScp;
exports.Server = Server;
exports.importPlugin = importPlugin;
exports.loadPlugins = loadPlugins;
