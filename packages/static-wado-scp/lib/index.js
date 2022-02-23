const { Stats } = require("@ohif/static-wado-util");
const StaticWado = require("@ohif/static-wado-creator");
const dcmjsDimse = require("dcmjs-dimse");
const dicomWebScpConfig = require("./dicomWebScpConfig");

const { Server, Scp } = dcmjsDimse;
const { CEchoResponse, CStoreResponse } = dcmjsDimse.responses;
const { Status, PresentationContextResult, SopClass, StorageClass } = dcmjsDimse.constants;

// An in-order list of transfer syntaxes.
/*
const AcceptedTransferSyntax = {
  "1.2.840.10008.1.2.4.80": "JpegLsLossless",
  "1.2.840.10008.1.2.4.100": "mpeg",
  "1.2.840.10008.1.2.4.101": "mpeg",
  "1.2.840.10008.1.2.4.102": "h264",
  "1.2.840.10008.1.2.4.103": "h264",
  "1.2.840.10008.1.2.4.70": "JpegLossless",
  "1.2.840.10008.1.2.5": "RleLossless",
  "1.2.840.10008.1.2.4.50": "JpegBaseline",
  "1.2.840.10008.1.2.1": "ExplicitVRLittleEndian",
  "1.2.840.10008.1.2": "ImplicitVRLittleEndian",
};
*/

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

const defaults = {
  isStudyData: true,
  isGroup: true,
  helpShort: "dicomwebscp",
  helpDescription: "Creates server to receive data on DIMSE and store it DICOM",
};

class DcmjsDimseScp extends Scp {
  constructor(socket, opts) {
    super(socket, opts);
    this.association = undefined;
    this.importer = new StaticWado(defaults);
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
        if (context.getAbstractSyntaxUid() === SopClass.Verification || Object.values(StorageClass).includes(context.getAbstractSyntaxUid())) {
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
