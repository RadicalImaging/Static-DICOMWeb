(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("@radicalimaging/static-wado-creator", [], factory);
	else if(typeof exports === 'object')
		exports["@radicalimaging/static-wado-creator"] = factory();
	else
		root["@radicalimaging/static-wado-creator"] = factory();
})(global, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./lib/DeleteStudy.ts":
/*!****************************!*\
  !*** ./lib/DeleteStudy.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }());
/* harmony import */ var _writer_JSONWriter__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./writer/JSONWriter */ "./lib/writer/JSONWriter.js");
/* harmony import */ var _writer_JSONWriter__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_writer_JSONWriter__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _dictionary_Tags__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./dictionary/Tags */ "./lib/dictionary/Tags.js");
/* harmony import */ var _dictionary_Tags__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_dictionary_Tags__WEBPACK_IMPORTED_MODULE_2__);



/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (options => async function (studyInstanceUid) {
  console.log("Delete Study", studyInstanceUid);
  const studyData = await this.scanStudy("studies", studyInstanceUid);
  studyData.delete();
  const allStudies = await Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())(options.directoryName, "studies/index.json.gz", []);
  const studiesWithoutDeleted = allStudies.filter(study => studyInstanceUid != _dictionary_Tags__WEBPACK_IMPORTED_MODULE_2___default().getValue(study, (_dictionary_Tags__WEBPACK_IMPORTED_MODULE_2___default().StudyInstanceUID)));
  await _writer_JSONWriter__WEBPACK_IMPORTED_MODULE_1___default()(options.directoryName, "studies", studiesWithoutDeleted);
  delete this.studyData;
});

/***/ }),

/***/ "./lib/RejectInstance.js":
/*!*******************************!*\
  !*** ./lib/RejectInstance.js ***!
  \*******************************/
/***/ ((module) => {

const dataExtractor = /^(.*studies)?[\\/]?([^/\\]+)[\\/](series[\\/])?([^/\\]+)([\\/]instances[\\/]([^/\\]*))?$/;

module.exports = options => async function (rejectPath, reason) {
  console.log("Reject instance", rejectPath, reason);
  const extracted = rejectPath.match(dataExtractor);

  if (!extracted) {
    console.log("Unable to reject", rejectPath, "because it isn't in the format studies/<studyUID>/series/<seriesUID>");
    return;
  }

  const [,, studyInstanceUid,, seriesInstanceUid,, sopInstanceUid] = extracted;
  const studyData = await this.scanStudy("studies", studyInstanceUid);
  if (options.verbose) console.log("Trying to reject", seriesInstanceUid, "because", reason);
  await studyData.reject(seriesInstanceUid, sopInstanceUid, reason);
  await studyData.writeDeduplicatedGroup();
  return studyData.writeMetadata();
};

/***/ }),

/***/ "./lib/StaticWado.ts":
/*!***************************!*\
  !*** ./lib/StaticWado.ts ***!
  \***************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ StaticWado)
/* harmony export */ });
Object(function webpackMissingModule() { var e = new Error("Cannot find module '@cornerstonejs/dicom-codec'"); e.code = 'MODULE_NOT_FOUND'; throw e; }());
Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }());



const dicomParser = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'dicom-parser'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const fs = __webpack_require__(/*! fs */ "fs");

const path = __webpack_require__(/*! path */ "path");

const {
  dirScanner
} = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const asyncIterableToBuffer = __webpack_require__(/*! ./operation/adapter/asyncIterableToBuffer */ "./lib/operation/adapter/asyncIterableToBuffer.js");

const getDataSet = __webpack_require__(/*! ./operation/getDataSet */ "./lib/operation/getDataSet.js");

const InstanceDeduplicate = __webpack_require__(/*! ./operation/InstanceDeduplicate */ "./lib/operation/InstanceDeduplicate.js");

const DeduplicateWriter = __webpack_require__(/*! ./writer/DeduplicateWriter */ "./lib/writer/DeduplicateWriter.js");

const ImageFrameWriter = __webpack_require__(/*! ./writer/ImageFrameWriter */ "./lib/writer/ImageFrameWriter.js");

const CompleteStudyWriter = __webpack_require__(/*! ./writer/CompleteStudyWriter */ "./lib/writer/CompleteStudyWriter.js");

const IdCreator = __webpack_require__(/*! ./util/IdCreator */ "./lib/util/IdCreator.js");

const ScanStudy = __webpack_require__(/*! ./operation/ScanStudy */ "./lib/operation/ScanStudy.js");

const HashDataWriter = __webpack_require__(/*! ./writer/HashDataWriter */ "./lib/writer/HashDataWriter.js");

const VideoWriter = __webpack_require__(/*! ./writer/VideoWriter */ "./lib/writer/VideoWriter.js");

const {
  transcodeImageFrame,
  transcodeId,
  transcodeMetadata
} = __webpack_require__(/*! ./operation/adapter/transcodeImage */ "./lib/operation/adapter/transcodeImage.js");

const ThumbnailWriter = __webpack_require__(/*! ./writer/ThumbnailWriter */ "./lib/writer/ThumbnailWriter.js");

const ThumbnailService = __webpack_require__(/*! ./operation/ThumbnailService */ "./lib/operation/ThumbnailService.js");

const DeleteStudy = __webpack_require__(/*! ./DeleteStudy */ "./lib/DeleteStudy.ts");

const RejectInstance = __webpack_require__(/*! ./RejectInstance */ "./lib/RejectInstance.js");

function setStudyData(studyData) {
  this.studyData = studyData;
}

class StaticWado {
  constructor(configuration) {
    const {
      rootDir = "~/dicomweb",
      pathDeduplicated = "deduplicated",
      pathInstances = "instances",
      verbose
    } = configuration;
    Object(function webpackMissingModule() { var e = new Error("Cannot find module '@cornerstonejs/dicom-codec'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())({
      verbose
    });
    const directoryName = Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())(rootDir);
    this.options = { ...configuration,
      directoryName,
      deduplicatedRoot: path.join(directoryName, pathDeduplicated),
      deduplicatedInstancesRoot: path.join(directoryName, pathInstances),
      TransferSyntaxUID: "1.2.840.10008.1.2"
    };
    this.callback = {
      uids: IdCreator(this.options),
      bulkdata: HashDataWriter(this.options),
      imageFrame: ImageFrameWriter(this.options),
      videoWriter: VideoWriter(this.options),
      thumbWriter: ThumbnailWriter(this.options),
      completeStudy: CompleteStudyWriter(this.options),
      metadata: InstanceDeduplicate(this.options),
      deduplicated: DeduplicateWriter(this.options),
      scanStudy: ScanStudy(this.options),
      reject: RejectInstance(this.options),
      delete: DeleteStudy(this.options),
      setStudyData
    };
  }
  /**
   * Rejects the given item, specified as studies/<studyUID>/series/<seriesUID>
   * Does NOT remove any files, but adds a flag to the study indicating the deleted series and instances.
   *
   * @param {string} args listing the instances to remove (may remove entire series)
   */


  async reject(args) {
    args.forEach(removal => {
      this.callback.reject(removal);
    });
  }
  /**
   * Deletes a study, as specified by the study instance UID by removing instance, deduplicated and studies files,
   * as well as removing the object from the studies list.
   *
   * @param {string[]} args listing the studies to remove
   */


  async delete(args) {
    args.forEach(studyUID => this.callback.delete(studyUID));
  }
  /**
   * Processes a set of DICOM files, where the starting point is a list of directory names or file instances.
   * This is used for importing DICOM files.
   *
   * @param {*} files
   * @param {*} callback
   * @param {*} params
   */


  async processFiles(files, params) {
    return dirScanner(files, { ...params,
      callback: async file => {
        try {
          const dicomp10stream = fs.createReadStream(file);
          await this.importBinaryDicom(dicomp10stream, { ...params,
            file
          });
          Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())("DICOM P10", "Parse DICOM P10 file");
        } catch (e) {
          console.error("Couldn't process", file, e);
        }
      }
    });
  }
  /**
   * Processes a study directory, matching up study instance UIDs.  Either processes the
   * deduplicated group directory or the instances directory, or the notifications directory.
   * @param {*} params
   */


  async processStudyDir(studyUids, params) {
    return dirScanner(params[params.scanStudies], { ...params,
      recursive: false,
      callback: (dir, name) => this.callback.scanStudy(dir, name)
    });
  }

  async importBinaryDicom(dicomp10stream, params) {
    // Read dicomp10 stream into buffer
    const buffer = await asyncIterableToBuffer(dicomp10stream); // Parse it

    const dataSet = dicomParser.parseDicom(buffer, params);
    const studyInstanceUid = dataSet.string("x0020000d");

    if (!studyInstanceUid) {
      console.log(`Can't import file ${params.file}`);
      return undefined;
    } // Extract uids


    const id = this.callback.uids({
      studyInstanceUid,
      seriesInstanceUid: dataSet.string("x0020000e"),
      sopInstanceUid: dataSet.string("x00080018"),
      transferSyntaxUid: dataSet.string("x00020010")
    }, params.file);
    const targetId = transcodeId(id, this.options);
    let bulkDataIndex = 0;
    let imageFrameIndex = 0;
    const thumbnailService = new ThumbnailService();
    const generator = {
      bulkdata: async (bulkData, options) => {
        const _bulkDataIndex = bulkDataIndex;
        bulkDataIndex += 1;
        return this.callback.bulkdata(targetId, _bulkDataIndex, bulkData, options);
      },
      imageFrame: async originalImageFrame => {
        const {
          imageFrame: transcodedImageFrame,
          id: transcodedId
        } = await transcodeImageFrame(id, targetId, originalImageFrame, dataSet, this.options);
        const currentImageFrameIndex = imageFrameIndex;
        imageFrameIndex += 1;
        thumbnailService.queueThumbnail({
          imageFrame: originalImageFrame,
          transcodedImageFrame,
          transcodedId,
          id,
          frameIndex: currentImageFrameIndex
        }, this.options);
        return this.callback.imageFrame(transcodedId, currentImageFrameIndex, transcodedImageFrame);
      },
      videoWriter: async _dataSet => this.callback.videoWriter(id, _dataSet)
    }; // convert to DICOMweb MetaData and BulkData

    const result = await getDataSet(dataSet, generator, this.options);
    const transcodedMeta = transcodeMetadata(result.metadata, id, this.options);
    thumbnailService.generateThumbnails(id, dataSet, transcodedMeta, this.callback);
    await this.callback.metadata(targetId, transcodedMeta); // resolve promise with statistics

    return {};
  }
  /**
   * The mkdicomweb command first runs mkdicomwebinstances, writing out the deduplicated data, and then runs the
   * mkdicomwebstudy command, creating the deduplicated data set.  This version, however, keeps the deduplicated
   * data in memory by default on a study level, which avoids needing to run the load process.
   */


  async executeCommand(input) {
    if (this.options.scanStudies) {
      // Scan one of the study directories - in this case, files is a set of study directories
      await this.processStudyDir(input, this.options);
    } else {
      await this.processFiles(input, this.options);
    }

    await this.close();
  }

  async close() {
    await this.callback.completeStudy();
    Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }())("Completed Study Processing");
  }

}

/***/ }),

/***/ "./lib/createMain.js":
/*!***************************!*\
  !*** ./lib/createMain.js ***!
  \***************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const StaticWado = __webpack_require__(/*! ./StaticWado */ "./lib/StaticWado.ts");

const adaptProgramOpts = __webpack_require__(/*! ./util/adaptProgramOpts */ "./lib/util/adaptProgramOpts.js");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, { ...this,
    isInstance: false,
    isGroup: true,
    isDeduplicate: true,
    isStudyData: true
  });
  const importer = new StaticWado(finalOptions);
  return importer.executeCommand(program.args);
};

/***/ }),

/***/ "./lib/deleteMain.js":
/*!***************************!*\
  !*** ./lib/deleteMain.js ***!
  \***************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const StaticWado = __webpack_require__(/*! ./StaticWado */ "./lib/StaticWado.ts");

const adaptProgramOpts = __webpack_require__(/*! ./util/adaptProgramOpts */ "./lib/util/adaptProgramOpts.js");

module.exports = function deleteMain(options, program) {
  const finalOptions = adaptProgramOpts(options, { ...this,
    isGroup: true,
    isStudyData: true
  });
  const importer = new StaticWado(finalOptions);
  return importer.delete(program.args);
};

/***/ }),

/***/ "./lib/dictionary/Tags.js":
/*!********************************!*\
  !*** ./lib/dictionary/Tags.js ***!
  \********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const dataDictionary = __webpack_require__(/*! ./dataDictionary */ "./lib/dictionary/dataDictionary.js");

const dcmjs = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'dcmjs'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const {
  naturalizeDataset,
  denaturalizeDataset
} = dcmjs.data.DicomMetaDictionary;
/** Find the actual tag for a private value */

const findPrivate = (item, tagObject, create) => {
  if (typeof tagObject === "string") return tagObject;
  if (typeof tagObject === "number") return `00000000${tagObject.toString(16)}`.slice(-8);
  const {
    creator,
    tag
  } = tagObject;
  if (!creator) return tag;
  const start = tag.substring(0, 4);
  const end = tag.substring(6, 8); // Should technically go all the way up, but for now only test 0x30 items

  let assignPosition;

  for (let offset = 0x10; offset < 0x40; offset++) {
    const testTag = `${start}00${offset.toString(16)}`;
    const testCreator = item[testTag];
    if (testCreator === undefined && assignPosition === undefined) assignPosition = offset;

    if (testCreator && testCreator.Value && testCreator.Value[0] === creator) {
      return `${start}${offset.toString(16)}${end}`;
    }
  }

  if (create) {
    if (!assignPosition) throw new Error(`Couldn't find any assign positions for ${creator} ${tag} in ${item}`);
    const creatorTag = `${start}00${assignPosition.toString(16)}`;
    item[creatorTag] = {
      Value: [creator],
      vr: 'CS'
    };
    return `${start}${assignPosition.toString(16)}${end}`;
  }
};

const DeduppedCreator = "dedupped";
const Tags = {
  // Raw tags have the x before them, not parsed yet
  RawMinTag: "x00000000",
  RawFirstBodyTag: "x00080000",
  RawTransferSyntaxUID: "x00020010",
  // This one isn't defined in the dataDictionary
  AvailableTransferSyntaxUID: "00083002",
  DeduppedCreator,
  // The references to extract data included in this object, 1..n values
  DeduppedRef: {
    creator: DeduppedCreator,
    tag: "00091010"
  },
  // The hash value of THIS object
  DeduppedHash: {
    creator: DeduppedCreator,
    tag: "00091011"
  },
  // Type of hash instance
  DeduppedType: {
    creator: DeduppedCreator,
    tag: "00091012"
  },
  InstanceType: "instance",
  InfoType: "info",
  naturalizeDataset,
  denaturalizeDataset,
  setValue: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    item[actualTag] = {
      Value: Array.isArray(value) ? value : [value]
    };
    return actualTag;
  },
  setList: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    item[actualTag] = {
      Value: Array.isArray(value) ? value : [value]
    };
    return actualTag;
  },
  pushList: (item, tag, value) => {
    const actualTag = findPrivate(item, tag, true);
    if (!item[actualTag]) item[actualTag] = {
      Value: []
    };
    item[actualTag].Value.push(value);
    return actualTag;
  },
  getValue: (item, tag) => {
    const actualTag = findPrivate(item, tag);
    if (!actualTag) return undefined;
    const value = item[actualTag];
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return value.length == 1 ? value[0] : value.length === 0 ? "" : value;
    if (value.Value) return value.Value.length == 1 ? value.Value[0] : value.Value.length === 0 ? "" : value.Value;
    return value;
  },
  getList: (item, tag) => {
    const actualTag = findPrivate(item, tag);
    if (!actualTag) return undefined;
    const value = item[actualTag];
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return value;
    if (value.Value) return value.Value;
    return [value];
  },
  removeValue: (item, tag) => {
    const actualTag = findPrivate(item, tag);
    if (actualTag) delete item[actualTag]; // TODO, remove creator tag if not used any longer
  },
  findPrivate
};
Object.keys(dataDictionary).forEach(key => {
  const value = dataDictionary[key];
  Tags[value.name] = key;
});
module.exports = Tags;

/***/ }),

/***/ "./lib/dictionary/dataDictionary.js":
/*!******************************************!*\
  !*** ./lib/dictionary/dataDictionary.js ***!
  \******************************************/
/***/ ((module) => {

const TAG_DICT = {
  "00000000": {
    tag: "(0000,0000)",
    vr: "UL",
    vm: "1",
    name: "CommandGroupLength"
  },
  "00000001": {
    tag: "(0000,0001)",
    vr: "UL",
    vm: "1",
    name: "CommandLengthToEnd"
  },
  "00000002": {
    tag: "(0000,0002)",
    vr: "UI",
    vm: "1",
    name: "AffectedSOPClassUID"
  },
  "00000003": {
    tag: "(0000,0003)",
    vr: "UI",
    vm: "1",
    name: "RequestedSOPClassUID"
  },
  "00000010": {
    tag: "(0000,0010)",
    vr: "SH",
    vm: "1",
    name: "CommandRecognitionCode"
  },
  "00000100": {
    tag: "(0000,0100)",
    vr: "US",
    vm: "1",
    name: "CommandField"
  },
  "00000110": {
    tag: "(0000,0110)",
    vr: "US",
    vm: "1",
    name: "MessageID"
  },
  "00000120": {
    tag: "(0000,0120)",
    vr: "US",
    vm: "1",
    name: "MessageIDBeingRespondedTo"
  },
  "00000200": {
    tag: "(0000,0200)",
    vr: "AE",
    vm: "1",
    name: "Initiator"
  },
  "00000300": {
    tag: "(0000,0300)",
    vr: "AE",
    vm: "1",
    name: "Receiver"
  },
  "00000400": {
    tag: "(0000,0400)",
    vr: "AE",
    vm: "1",
    name: "FindLocation"
  },
  "00000600": {
    tag: "(0000,0600)",
    vr: "AE",
    vm: "1",
    name: "MoveDestination"
  },
  "00000700": {
    tag: "(0000,0700)",
    vr: "US",
    vm: "1",
    name: "Priority"
  },
  "00000800": {
    tag: "(0000,0800)",
    vr: "US",
    vm: "1",
    name: "CommandDataSetType"
  },
  "00000850": {
    tag: "(0000,0850)",
    vr: "US",
    vm: "1",
    name: "NumberOfMatches"
  },
  "00000860": {
    tag: "(0000,0860)",
    vr: "US",
    vm: "1",
    name: "ResponseSequenceNumber"
  },
  "00000900": {
    tag: "(0000,0900)",
    vr: "US",
    vm: "1",
    name: "Status"
  },
  "00000901": {
    tag: "(0000,0901)",
    vr: "AT",
    vm: "1-n",
    name: "OffendingElement"
  },
  "00000902": {
    tag: "(0000,0902)",
    vr: "LO",
    vm: "1",
    name: "ErrorComment"
  },
  "00000903": {
    tag: "(0000,0903)",
    vr: "US",
    vm: "1",
    name: "ErrorID"
  },
  "00001000": {
    tag: "(0000,1000)",
    vr: "UI",
    vm: "1",
    name: "AffectedSOPInstanceUID"
  },
  "00001001": {
    tag: "(0000,1001)",
    vr: "UI",
    vm: "1",
    name: "RequestedSOPInstanceUID"
  },
  "00001002": {
    tag: "(0000,1002)",
    vr: "US",
    vm: "1",
    name: "EventTypeID"
  },
  "00001005": {
    tag: "(0000,1005)",
    vr: "AT",
    vm: "1-n",
    name: "AttributeIdentifierList"
  },
  "00001008": {
    tag: "(0000,1008)",
    vr: "US",
    vm: "1",
    name: "ActionTypeID"
  },
  "00001020": {
    tag: "(0000,1020)",
    vr: "US",
    vm: "1",
    name: "NumberOfRemainingSuboperations"
  },
  "00001021": {
    tag: "(0000,1021)",
    vr: "US",
    vm: "1",
    name: "NumberOfCompletedSuboperations"
  },
  "00001022": {
    tag: "(0000,1022)",
    vr: "US",
    vm: "1",
    name: "NumberOfFailedSuboperations"
  },
  "00001023": {
    tag: "(0000,1023)",
    vr: "US",
    vm: "1",
    name: "NumberOfWarningSuboperations"
  },
  "00001030": {
    tag: "(0000,1030)",
    vr: "AE",
    vm: "1",
    name: "MoveOriginatorApplicationEntityTitle"
  },
  "00001031": {
    tag: "(0000,1031)",
    vr: "US",
    vm: "1",
    name: "MoveOriginatorMessageID"
  },
  "00004000": {
    tag: "(0000,4000)",
    vr: "LT",
    vm: "1",
    name: "DialogReceiver"
  },
  "00004010": {
    tag: "(0000,4010)",
    vr: "LT",
    vm: "1",
    name: "TerminalType"
  },
  "00005010": {
    tag: "(0000,5010)",
    vr: "SH",
    vm: "1",
    name: "MessageSetID"
  },
  "00005020": {
    tag: "(0000,5020)",
    vr: "SH",
    vm: "1",
    name: "EndMessageID"
  },
  "00005110": {
    tag: "(0000,5110)",
    vr: "LT",
    vm: "1",
    name: "DisplayFormat"
  },
  "00005120": {
    tag: "(0000,5120)",
    vr: "LT",
    vm: "1",
    name: "PagePositionID"
  },
  "00005130": {
    tag: "(0000,5130)",
    vr: "CS",
    vm: "1",
    name: "TextFormatID"
  },
  "00005140": {
    tag: "(0000,5140)",
    vr: "CS",
    vm: "1",
    name: "NormalReverse"
  },
  "00005150": {
    tag: "(0000,5150)",
    vr: "CS",
    vm: "1",
    name: "AddGrayScale"
  },
  "00005160": {
    tag: "(0000,5160)",
    vr: "CS",
    vm: "1",
    name: "Borders"
  },
  "00005170": {
    tag: "(0000,5170)",
    vr: "IS",
    vm: "1",
    name: "Copies"
  },
  "00005180": {
    tag: "(0000,5180)",
    vr: "CS",
    vm: "1",
    name: "CommandMagnificationType"
  },
  "00005190": {
    tag: "(0000,5190)",
    vr: "CS",
    vm: "1",
    name: "Erase"
  },
  "000051A0": {
    tag: "(0000,51A0)",
    vr: "CS",
    vm: "1",
    name: "Print"
  },
  "000051B0": {
    tag: "(0000,51B0)",
    vr: "US",
    vm: "1-n",
    name: "Overlays"
  },
  "00020000": {
    tag: "(0002,0000)",
    vr: "UL",
    vm: "1",
    name: "FileMetaInformationGroupLength"
  },
  "00020001": {
    tag: "(0002,0001)",
    vr: "OB",
    vm: "1",
    name: "FileMetaInformationVersion"
  },
  "00020002": {
    tag: "(0002,0002)",
    vr: "UI",
    vm: "1",
    name: "MediaStorageSOPClassUID"
  },
  "00020003": {
    tag: "(0002,0003)",
    vr: "UI",
    vm: "1",
    name: "MediaStorageSOPInstanceUID"
  },
  "00020010": {
    tag: "(0002,0010)",
    vr: "UI",
    vm: "1",
    name: "TransferSyntaxUID"
  },
  "00020012": {
    tag: "(0002,0012)",
    vr: "UI",
    vm: "1",
    name: "ImplementationClassUID"
  },
  "00020013": {
    tag: "(0002,0013)",
    vr: "SH",
    vm: "1",
    name: "ImplementationVersionName"
  },
  "00020016": {
    tag: "(0002,0016)",
    vr: "AE",
    vm: "1",
    name: "SourceApplicationEntityTitle"
  },
  "00020017": {
    tag: "(0002,0017)",
    vr: "AE",
    vm: "1",
    name: "SendingApplicationEntityTitle"
  },
  "00020018": {
    tag: "(0002,0018)",
    vr: "AE",
    vm: "1",
    name: "ReceivingApplicationEntityTitle"
  },
  "00020100": {
    tag: "(0002,0100)",
    vr: "UI",
    vm: "1",
    name: "PrivateInformationCreatorUID"
  },
  "00020102": {
    tag: "(0002,0102)",
    vr: "OB",
    vm: "1",
    name: "PrivateInformation"
  },
  "00041130": {
    tag: "(0004,1130)",
    vr: "CS",
    vm: "1",
    name: "FileSetID"
  },
  "00041141": {
    tag: "(0004,1141)",
    vr: "CS",
    vm: "1-8",
    name: "FileSetDescriptorFileID"
  },
  "00041142": {
    tag: "(0004,1142)",
    vr: "CS",
    vm: "1",
    name: "SpecificCharacterSetOfFileSetDescriptorFile"
  },
  "00041200": {
    tag: "(0004,1200)",
    vr: "UL",
    vm: "1",
    name: "OffsetOfTheFirstDirectoryRecordOfTheRootDirectoryEntity"
  },
  "00041202": {
    tag: "(0004,1202)",
    vr: "UL",
    vm: "1",
    name: "OffsetOfTheLastDirectoryRecordOfTheRootDirectoryEntity"
  },
  "00041212": {
    tag: "(0004,1212)",
    vr: "US",
    vm: "1",
    name: "FileSetConsistencyFlag"
  },
  "00041220": {
    tag: "(0004,1220)",
    vr: "SQ",
    vm: "1",
    name: "DirectoryRecordSequence"
  },
  "00041400": {
    tag: "(0004,1400)",
    vr: "UL",
    vm: "1",
    name: "OffsetOfTheNextDirectoryRecord"
  },
  "00041410": {
    tag: "(0004,1410)",
    vr: "US",
    vm: "1",
    name: "RecordInUseFlag"
  },
  "00041420": {
    tag: "(0004,1420)",
    vr: "UL",
    vm: "1",
    name: "OffsetOfReferencedLowerLevelDirectoryEntity"
  },
  "00041430": {
    tag: "(0004,1430)",
    vr: "CS",
    vm: "1",
    name: "DirectoryRecordType"
  },
  "00041432": {
    tag: "(0004,1432)",
    vr: "UI",
    vm: "1",
    name: "PrivateRecordUID"
  },
  "00041500": {
    tag: "(0004,1500)",
    vr: "CS",
    vm: "1-8",
    name: "ReferencedFileID"
  },
  "00041504": {
    tag: "(0004,1504)",
    vr: "UL",
    vm: "1",
    name: "MRDRDirectoryRecordOffset"
  },
  "00041510": {
    tag: "(0004,1510)",
    vr: "UI",
    vm: "1",
    name: "ReferencedSOPClassUIDInFile"
  },
  "00041511": {
    tag: "(0004,1511)",
    vr: "UI",
    vm: "1",
    name: "ReferencedSOPInstanceUIDInFile"
  },
  "00041512": {
    tag: "(0004,1512)",
    vr: "UI",
    vm: "1",
    name: "ReferencedTransferSyntaxUIDInFile"
  },
  "0004151A": {
    tag: "(0004,151A)",
    vr: "UI",
    vm: "1-n",
    name: "ReferencedRelatedGeneralSOPClassUIDInFile"
  },
  "00041600": {
    tag: "(0004,1600)",
    vr: "UL",
    vm: "1",
    name: "NumberOfReferences"
  },
  "00080001": {
    tag: "(0008,0001)",
    vr: "UL",
    vm: "1",
    name: "LengthToEnd"
  },
  "00080005": {
    tag: "(0008,0005)",
    vr: "CS",
    vm: "1-n",
    name: "SpecificCharacterSet"
  },
  "00080006": {
    tag: "(0008,0006)",
    vr: "SQ",
    vm: "1",
    name: "LanguageCodeSequence"
  },
  "00080008": {
    tag: "(0008,0008)",
    vr: "CS",
    vm: "2-n",
    name: "ImageType"
  },
  "00080010": {
    tag: "(0008,0010)",
    vr: "SH",
    vm: "1",
    name: "RecognitionCode"
  },
  "00080012": {
    tag: "(0008,0012)",
    vr: "DA",
    vm: "1",
    name: "InstanceCreationDate"
  },
  "00080013": {
    tag: "(0008,0013)",
    vr: "TM",
    vm: "1",
    name: "InstanceCreationTime"
  },
  "00080014": {
    tag: "(0008,0014)",
    vr: "UI",
    vm: "1",
    name: "InstanceCreatorUID"
  },
  "00080015": {
    tag: "(0008,0015)",
    vr: "DT",
    vm: "1",
    name: "InstanceCoercionDateTime"
  },
  "00080016": {
    tag: "(0008,0016)",
    vr: "UI",
    vm: "1",
    name: "SOPClassUID"
  },
  "00080018": {
    tag: "(0008,0018)",
    vr: "UI",
    vm: "1",
    name: "SOPInstanceUID"
  },
  "0008001A": {
    tag: "(0008,001A)",
    vr: "UI",
    vm: "1-n",
    name: "RelatedGeneralSOPClassUID"
  },
  "0008001B": {
    tag: "(0008,001B)",
    vr: "UI",
    vm: "1",
    name: "OriginalSpecializedSOPClassUID"
  },
  "00080020": {
    tag: "(0008,0020)",
    vr: "DA",
    vm: "1",
    name: "StudyDate"
  },
  "00080021": {
    tag: "(0008,0021)",
    vr: "DA",
    vm: "1",
    name: "SeriesDate"
  },
  "00080022": {
    tag: "(0008,0022)",
    vr: "DA",
    vm: "1",
    name: "AcquisitionDate"
  },
  "00080023": {
    tag: "(0008,0023)",
    vr: "DA",
    vm: "1",
    name: "ContentDate"
  },
  "00080024": {
    tag: "(0008,0024)",
    vr: "DA",
    vm: "1",
    name: "OverlayDate"
  },
  "00080025": {
    tag: "(0008,0025)",
    vr: "DA",
    vm: "1",
    name: "CurveDate"
  },
  "0008002A": {
    tag: "(0008,002A)",
    vr: "DT",
    vm: "1",
    name: "AcquisitionDateTime"
  },
  "00080030": {
    tag: "(0008,0030)",
    vr: "TM",
    vm: "1",
    name: "StudyTime"
  },
  "00080031": {
    tag: "(0008,0031)",
    vr: "TM",
    vm: "1",
    name: "SeriesTime"
  },
  "00080032": {
    tag: "(0008,0032)",
    vr: "TM",
    vm: "1",
    name: "AcquisitionTime"
  },
  "00080033": {
    tag: "(0008,0033)",
    vr: "TM",
    vm: "1",
    name: "ContentTime"
  },
  "00080034": {
    tag: "(0008,0034)",
    vr: "TM",
    vm: "1",
    name: "OverlayTime"
  },
  "00080035": {
    tag: "(0008,0035)",
    vr: "TM",
    vm: "1",
    name: "CurveTime"
  },
  "00080040": {
    tag: "(0008,0040)",
    vr: "US",
    vm: "1",
    name: "DataSetType"
  },
  "00080041": {
    tag: "(0008,0041)",
    vr: "LO",
    vm: "1",
    name: "DataSetSubtype"
  },
  "00080042": {
    tag: "(0008,0042)",
    vr: "CS",
    vm: "1",
    name: "NuclearMedicineSeriesType"
  },
  "00080050": {
    tag: "(0008,0050)",
    vr: "SH",
    vm: "1",
    name: "AccessionNumber"
  },
  "00080051": {
    tag: "(0008,0051)",
    vr: "SQ",
    vm: "1",
    name: "IssuerOfAccessionNumberSequence"
  },
  "00080052": {
    tag: "(0008,0052)",
    vr: "CS",
    vm: "1",
    name: "QueryRetrieveLevel"
  },
  "00080053": {
    tag: "(0008,0053)",
    vr: "CS",
    vm: "1",
    name: "QueryRetrieveView"
  },
  "00080054": {
    tag: "(0008,0054)",
    vr: "AE",
    vm: "1-n",
    name: "RetrieveAETitle"
  },
  "00080055": {
    tag: "(0008,0055)",
    vr: "AE",
    vm: "1",
    name: "StationAETitle"
  },
  "00080056": {
    tag: "(0008,0056)",
    vr: "CS",
    vm: "1",
    name: "InstanceAvailability"
  },
  "00080058": {
    tag: "(0008,0058)",
    vr: "UI",
    vm: "1-n",
    name: "FailedSOPInstanceUIDList"
  },
  "00080060": {
    tag: "(0008,0060)",
    vr: "CS",
    vm: "1",
    name: "Modality"
  },
  "00080061": {
    tag: "(0008,0061)",
    vr: "CS",
    vm: "1-n",
    name: "ModalitiesInStudy"
  },
  "00080062": {
    tag: "(0008,0062)",
    vr: "UI",
    vm: "1-n",
    name: "SOPClassesInStudy"
  },
  "00080063": {
    tag: "(0008,0063)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicRegionsInStudyCodeSequence"
  },
  "00080064": {
    tag: "(0008,0064)",
    vr: "CS",
    vm: "1",
    name: "ConversionType"
  },
  "00080068": {
    tag: "(0008,0068)",
    vr: "CS",
    vm: "1",
    name: "PresentationIntentType"
  },
  "00080070": {
    tag: "(0008,0070)",
    vr: "LO",
    vm: "1",
    name: "Manufacturer"
  },
  "00080080": {
    tag: "(0008,0080)",
    vr: "LO",
    vm: "1",
    name: "InstitutionName"
  },
  "00080081": {
    tag: "(0008,0081)",
    vr: "ST",
    vm: "1",
    name: "InstitutionAddress"
  },
  "00080082": {
    tag: "(0008,0082)",
    vr: "SQ",
    vm: "1",
    name: "InstitutionCodeSequence"
  },
  "00080090": {
    tag: "(0008,0090)",
    vr: "PN",
    vm: "1",
    name: "ReferringPhysicianName"
  },
  "00080092": {
    tag: "(0008,0092)",
    vr: "ST",
    vm: "1",
    name: "ReferringPhysicianAddress"
  },
  "00080094": {
    tag: "(0008,0094)",
    vr: "SH",
    vm: "1-n",
    name: "ReferringPhysicianTelephoneNumbers"
  },
  "00080096": {
    tag: "(0008,0096)",
    vr: "SQ",
    vm: "1",
    name: "ReferringPhysicianIdentificationSequence"
  },
  "0008009C": {
    tag: "(0008,009C)",
    vr: "PN",
    vm: "1-n",
    name: "ConsultingPhysicianName"
  },
  "0008009D": {
    tag: "(0008,009D)",
    vr: "SQ",
    vm: "1",
    name: "ConsultingPhysicianIdentificationSequence"
  },
  "00080100": {
    tag: "(0008,0100)",
    vr: "SH",
    vm: "1",
    name: "CodeValue"
  },
  "00080101": {
    tag: "(0008,0101)",
    vr: "LO",
    vm: "1",
    name: "ExtendedCodeValue"
  },
  "00080102": {
    tag: "(0008,0102)",
    vr: "SH",
    vm: "1",
    name: "CodingSchemeDesignator"
  },
  "00080103": {
    tag: "(0008,0103)",
    vr: "SH",
    vm: "1",
    name: "CodingSchemeVersion"
  },
  "00080104": {
    tag: "(0008,0104)",
    vr: "LO",
    vm: "1",
    name: "CodeMeaning"
  },
  "00080105": {
    tag: "(0008,0105)",
    vr: "CS",
    vm: "1",
    name: "MappingResource"
  },
  "00080106": {
    tag: "(0008,0106)",
    vr: "DT",
    vm: "1",
    name: "ContextGroupVersion"
  },
  "00080107": {
    tag: "(0008,0107)",
    vr: "DT",
    vm: "1",
    name: "ContextGroupLocalVersion"
  },
  "00080108": {
    tag: "(0008,0108)",
    vr: "LT",
    vm: "1",
    name: "ExtendedCodeMeaning"
  },
  "00080109": {
    tag: "(0008,0109)",
    vr: "SQ",
    vm: "1",
    name: "CodingSchemeResourcesSequence"
  },
  "0008010A": {
    tag: "(0008,010A)",
    vr: "CS",
    vm: "1",
    name: "CodingSchemeURLType"
  },
  "0008010B": {
    tag: "(0008,010B)",
    vr: "CS",
    vm: "1",
    name: "ContextGroupExtensionFlag"
  },
  "0008010C": {
    tag: "(0008,010C)",
    vr: "UI",
    vm: "1",
    name: "CodingSchemeUID"
  },
  "0008010D": {
    tag: "(0008,010D)",
    vr: "UI",
    vm: "1",
    name: "ContextGroupExtensionCreatorUID"
  },
  "0008010E": {
    tag: "(0008,010E)",
    vr: "UR",
    vm: "1",
    name: "CodingSchemeURL"
  },
  "0008010F": {
    tag: "(0008,010F)",
    vr: "CS",
    vm: "1",
    name: "ContextIdentifier"
  },
  "00080110": {
    tag: "(0008,0110)",
    vr: "SQ",
    vm: "1",
    name: "CodingSchemeIdentificationSequence"
  },
  "00080112": {
    tag: "(0008,0112)",
    vr: "LO",
    vm: "1",
    name: "CodingSchemeRegistry"
  },
  "00080114": {
    tag: "(0008,0114)",
    vr: "ST",
    vm: "1",
    name: "CodingSchemeExternalID"
  },
  "00080115": {
    tag: "(0008,0115)",
    vr: "ST",
    vm: "1",
    name: "CodingSchemeName"
  },
  "00080116": {
    tag: "(0008,0116)",
    vr: "ST",
    vm: "1",
    name: "CodingSchemeResponsibleOrganization"
  },
  "00080117": {
    tag: "(0008,0117)",
    vr: "UI",
    vm: "1",
    name: "ContextUID"
  },
  "00080118": {
    tag: "(0008,0118)",
    vr: "UI",
    vm: "1",
    name: "MappingResourceUID"
  },
  "00080119": {
    tag: "(0008,0119)",
    vr: "UC",
    vm: "1",
    name: "LongCodeValue"
  },
  "00080120": {
    tag: "(0008,0120)",
    vr: "UR",
    vm: "1",
    name: "URNCodeValue"
  },
  "00080121": {
    tag: "(0008,0121)",
    vr: "SQ",
    vm: "1",
    name: "EquivalentCodeSequence"
  },
  "00080122": {
    tag: "(0008,0122)",
    vr: "LO",
    vm: "1",
    name: "MappingResourceName"
  },
  "00080123": {
    tag: "(0008,0123)",
    vr: "SQ",
    vm: "1",
    name: "ContextGroupIdentificationSequence"
  },
  "00080124": {
    tag: "(0008,0124)",
    vr: "SQ",
    vm: "1",
    name: "MappingResourceIdentificationSequence"
  },
  "00080201": {
    tag: "(0008,0201)",
    vr: "SH",
    vm: "1",
    name: "TimezoneOffsetFromUTC"
  },
  "00080220": {
    tag: "(0008,0220)",
    vr: "SQ",
    vm: "1",
    name: "ResponsibleGroupCodeSequence"
  },
  "00080221": {
    tag: "(0008,0221)",
    vr: "CS",
    vm: "1",
    name: "EquipmentModality"
  },
  "00080222": {
    tag: "(0008,0222)",
    vr: "LO",
    vm: "1",
    name: "ManufacturerRelatedModelGroup"
  },
  "00080300": {
    tag: "(0008,0300)",
    vr: "SQ",
    vm: "1",
    name: "PrivateDataElementCharacteristicsSequence"
  },
  "00080301": {
    tag: "(0008,0301)",
    vr: "US",
    vm: "1",
    name: "PrivateGroupReference"
  },
  "00080302": {
    tag: "(0008,0302)",
    vr: "LO",
    vm: "1",
    name: "PrivateCreatorReference"
  },
  "00080303": {
    tag: "(0008,0303)",
    vr: "CS",
    vm: "1",
    name: "BlockIdentifyingInformationStatus"
  },
  "00080304": {
    tag: "(0008,0304)",
    vr: "US",
    vm: "1-n",
    name: "NonidentifyingPrivateElements"
  },
  "00080306": {
    tag: "(0008,0306)",
    vr: "US",
    vm: "1-n",
    name: "IdentifyingPrivateElements"
  },
  "00080305": {
    tag: "(0008,0305)",
    vr: "SQ",
    vm: "1",
    name: "DeidentificationActionSequence"
  },
  "00080307": {
    tag: "(0008,0307)",
    vr: "CS",
    vm: "1",
    name: "DeidentificationAction"
  },
  "00080308": {
    tag: "(0008,0308)",
    vr: "US",
    vm: "1",
    name: "PrivateDataElement"
  },
  "00080309": {
    tag: "(0008,0309)",
    vr: "UL",
    vm: "1-3",
    name: "PrivateDataElementValueMultiplicity"
  },
  "0008030A": {
    tag: "(0008,030A)",
    vr: "CS",
    vm: "1",
    name: "PrivateDataElementValueRepresentation"
  },
  "0008030B": {
    tag: "(0008,030B)",
    vr: "UL",
    vm: "1-2",
    name: "PrivateDataElementNumberOfItems"
  },
  "0008030C": {
    tag: "(0008,030C)",
    vr: "UC",
    vm: "1",
    name: "PrivateDataElementName"
  },
  "0008030D": {
    tag: "(0008,030D)",
    vr: "UC",
    vm: "1",
    name: "PrivateDataElementKeyword"
  },
  "0008030E": {
    tag: "(0008,030E)",
    vr: "UT",
    vm: "1",
    name: "PrivateDataElementDescription"
  },
  "0008030F": {
    tag: "(0008,030F)",
    vr: "UT",
    vm: "1",
    name: "PrivateDataElementEncoding"
  },
  "00080310": {
    tag: "(0008,0310)",
    vr: "SQ",
    vm: "1",
    name: "PrivateDataElementDefinitionSequence"
  },
  "00081000": {
    tag: "(0008,1000)",
    vr: "AE",
    vm: "1",
    name: "NetworkID"
  },
  "00081010": {
    tag: "(0008,1010)",
    vr: "SH",
    vm: "1",
    name: "StationName"
  },
  "00081030": {
    tag: "(0008,1030)",
    vr: "LO",
    vm: "1",
    name: "StudyDescription"
  },
  "00081032": {
    tag: "(0008,1032)",
    vr: "SQ",
    vm: "1",
    name: "ProcedureCodeSequence"
  },
  "0008103E": {
    tag: "(0008,103E)",
    vr: "LO",
    vm: "1",
    name: "SeriesDescription"
  },
  "0008103F": {
    tag: "(0008,103F)",
    vr: "SQ",
    vm: "1",
    name: "SeriesDescriptionCodeSequence"
  },
  "00081040": {
    tag: "(0008,1040)",
    vr: "LO",
    vm: "1",
    name: "InstitutionalDepartmentName"
  },
  "00081048": {
    tag: "(0008,1048)",
    vr: "PN",
    vm: "1-n",
    name: "PhysiciansOfRecord"
  },
  "00081049": {
    tag: "(0008,1049)",
    vr: "SQ",
    vm: "1",
    name: "PhysiciansOfRecordIdentificationSequence"
  },
  "00081050": {
    tag: "(0008,1050)",
    vr: "PN",
    vm: "1-n",
    name: "PerformingPhysicianName"
  },
  "00081052": {
    tag: "(0008,1052)",
    vr: "SQ",
    vm: "1",
    name: "PerformingPhysicianIdentificationSequence"
  },
  "00081060": {
    tag: "(0008,1060)",
    vr: "PN",
    vm: "1-n",
    name: "NameOfPhysiciansReadingStudy"
  },
  "00081062": {
    tag: "(0008,1062)",
    vr: "SQ",
    vm: "1",
    name: "PhysiciansReadingStudyIdentificationSequence"
  },
  "00081070": {
    tag: "(0008,1070)",
    vr: "PN",
    vm: "1-n",
    name: "OperatorsName"
  },
  "00081072": {
    tag: "(0008,1072)",
    vr: "SQ",
    vm: "1",
    name: "OperatorIdentificationSequence"
  },
  "00081080": {
    tag: "(0008,1080)",
    vr: "LO",
    vm: "1-n",
    name: "AdmittingDiagnosesDescription"
  },
  "00081084": {
    tag: "(0008,1084)",
    vr: "SQ",
    vm: "1",
    name: "AdmittingDiagnosesCodeSequence"
  },
  "00081090": {
    tag: "(0008,1090)",
    vr: "LO",
    vm: "1",
    name: "ManufacturerModelName"
  },
  "00081100": {
    tag: "(0008,1100)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedResultsSequence"
  },
  "00081110": {
    tag: "(0008,1110)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedStudySequence"
  },
  "00081111": {
    tag: "(0008,1111)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPerformedProcedureStepSequence"
  },
  "00081115": {
    tag: "(0008,1115)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedSeriesSequence"
  },
  "00081120": {
    tag: "(0008,1120)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPatientSequence"
  },
  "00081125": {
    tag: "(0008,1125)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedVisitSequence"
  },
  "00081130": {
    tag: "(0008,1130)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedOverlaySequence"
  },
  "00081134": {
    tag: "(0008,1134)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedStereometricInstanceSequence"
  },
  "0008113A": {
    tag: "(0008,113A)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedWaveformSequence"
  },
  "00081140": {
    tag: "(0008,1140)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedImageSequence"
  },
  "00081145": {
    tag: "(0008,1145)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedCurveSequence"
  },
  "0008114A": {
    tag: "(0008,114A)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedInstanceSequence"
  },
  "0008114B": {
    tag: "(0008,114B)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedRealWorldValueMappingInstanceSequence"
  },
  "00081150": {
    tag: "(0008,1150)",
    vr: "UI",
    vm: "1",
    name: "ReferencedSOPClassUID"
  },
  "00081155": {
    tag: "(0008,1155)",
    vr: "UI",
    vm: "1",
    name: "ReferencedSOPInstanceUID"
  },
  "00081156": {
    tag: "(0008,1156)",
    vr: "SQ",
    vm: "1",
    name: "DefinitionSourceSequence"
  },
  "0008115A": {
    tag: "(0008,115A)",
    vr: "UI",
    vm: "1-n",
    name: "SOPClassesSupported"
  },
  "00081160": {
    tag: "(0008,1160)",
    vr: "IS",
    vm: "1-n",
    name: "ReferencedFrameNumber"
  },
  "00081161": {
    tag: "(0008,1161)",
    vr: "UL",
    vm: "1-n",
    name: "SimpleFrameList"
  },
  "00081162": {
    tag: "(0008,1162)",
    vr: "UL",
    vm: "3-3n",
    name: "CalculatedFrameList"
  },
  "00081163": {
    tag: "(0008,1163)",
    vr: "FD",
    vm: "2",
    name: "TimeRange"
  },
  "00081164": {
    tag: "(0008,1164)",
    vr: "SQ",
    vm: "1",
    name: "FrameExtractionSequence"
  },
  "00081167": {
    tag: "(0008,1167)",
    vr: "UI",
    vm: "1",
    name: "MultiFrameSourceSOPInstanceUID"
  },
  "00081190": {
    tag: "(0008,1190)",
    vr: "UR",
    vm: "1",
    name: "RetrieveURL"
  },
  "00081195": {
    tag: "(0008,1195)",
    vr: "UI",
    vm: "1",
    name: "TransactionUID"
  },
  "00081196": {
    tag: "(0008,1196)",
    vr: "US",
    vm: "1",
    name: "WarningReason"
  },
  "00081197": {
    tag: "(0008,1197)",
    vr: "US",
    vm: "1",
    name: "FailureReason"
  },
  "00081198": {
    tag: "(0008,1198)",
    vr: "SQ",
    vm: "1",
    name: "FailedSOPSequence"
  },
  "00081199": {
    tag: "(0008,1199)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedSOPSequence"
  },
  "0008119A": {
    tag: "(0008,119A)",
    vr: "SQ",
    vm: "1",
    name: "OtherFailuresSequence"
  },
  "00081200": {
    tag: "(0008,1200)",
    vr: "SQ",
    vm: "1",
    name: "StudiesContainingOtherReferencedInstancesSequence"
  },
  "00081250": {
    tag: "(0008,1250)",
    vr: "SQ",
    vm: "1",
    name: "RelatedSeriesSequence"
  },
  "00082110": {
    tag: "(0008,2110)",
    vr: "CS",
    vm: "1",
    name: "LossyImageCompressionRetired"
  },
  "00082111": {
    tag: "(0008,2111)",
    vr: "ST",
    vm: "1",
    name: "DerivationDescription"
  },
  "00082112": {
    tag: "(0008,2112)",
    vr: "SQ",
    vm: "1",
    name: "SourceImageSequence"
  },
  "00082120": {
    tag: "(0008,2120)",
    vr: "SH",
    vm: "1",
    name: "StageName"
  },
  "00082122": {
    tag: "(0008,2122)",
    vr: "IS",
    vm: "1",
    name: "StageNumber"
  },
  "00082124": {
    tag: "(0008,2124)",
    vr: "IS",
    vm: "1",
    name: "NumberOfStages"
  },
  "00082127": {
    tag: "(0008,2127)",
    vr: "SH",
    vm: "1",
    name: "ViewName"
  },
  "00082128": {
    tag: "(0008,2128)",
    vr: "IS",
    vm: "1",
    name: "ViewNumber"
  },
  "00082129": {
    tag: "(0008,2129)",
    vr: "IS",
    vm: "1",
    name: "NumberOfEventTimers"
  },
  "0008212A": {
    tag: "(0008,212A)",
    vr: "IS",
    vm: "1",
    name: "NumberOfViewsInStage"
  },
  "00082130": {
    tag: "(0008,2130)",
    vr: "DS",
    vm: "1-n",
    name: "EventElapsedTimes"
  },
  "00082132": {
    tag: "(0008,2132)",
    vr: "LO",
    vm: "1-n",
    name: "EventTimerNames"
  },
  "00082133": {
    tag: "(0008,2133)",
    vr: "SQ",
    vm: "1",
    name: "EventTimerSequence"
  },
  "00082134": {
    tag: "(0008,2134)",
    vr: "FD",
    vm: "1",
    name: "EventTimeOffset"
  },
  "00082135": {
    tag: "(0008,2135)",
    vr: "SQ",
    vm: "1",
    name: "EventCodeSequence"
  },
  "00082142": {
    tag: "(0008,2142)",
    vr: "IS",
    vm: "1",
    name: "StartTrim"
  },
  "00082143": {
    tag: "(0008,2143)",
    vr: "IS",
    vm: "1",
    name: "StopTrim"
  },
  "00082144": {
    tag: "(0008,2144)",
    vr: "IS",
    vm: "1",
    name: "RecommendedDisplayFrameRate"
  },
  "00082200": {
    tag: "(0008,2200)",
    vr: "CS",
    vm: "1",
    name: "TransducerPosition"
  },
  "00082204": {
    tag: "(0008,2204)",
    vr: "CS",
    vm: "1",
    name: "TransducerOrientation"
  },
  "00082208": {
    tag: "(0008,2208)",
    vr: "CS",
    vm: "1",
    name: "AnatomicStructure"
  },
  "00082218": {
    tag: "(0008,2218)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicRegionSequence"
  },
  "00082220": {
    tag: "(0008,2220)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicRegionModifierSequence"
  },
  "00082228": {
    tag: "(0008,2228)",
    vr: "SQ",
    vm: "1",
    name: "PrimaryAnatomicStructureSequence"
  },
  "00082229": {
    tag: "(0008,2229)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicStructureSpaceOrRegionSequence"
  },
  "00082230": {
    tag: "(0008,2230)",
    vr: "SQ",
    vm: "1",
    name: "PrimaryAnatomicStructureModifierSequence"
  },
  "00082240": {
    tag: "(0008,2240)",
    vr: "SQ",
    vm: "1",
    name: "TransducerPositionSequence"
  },
  "00082242": {
    tag: "(0008,2242)",
    vr: "SQ",
    vm: "1",
    name: "TransducerPositionModifierSequence"
  },
  "00082244": {
    tag: "(0008,2244)",
    vr: "SQ",
    vm: "1",
    name: "TransducerOrientationSequence"
  },
  "00082246": {
    tag: "(0008,2246)",
    vr: "SQ",
    vm: "1",
    name: "TransducerOrientationModifierSequence"
  },
  "00082251": {
    tag: "(0008,2251)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicStructureSpaceOrRegionCodeSequenceTrial"
  },
  "00082253": {
    tag: "(0008,2253)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicPortalOfEntranceCodeSequenceTrial"
  },
  "00082255": {
    tag: "(0008,2255)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicApproachDirectionCodeSequenceTrial"
  },
  "00082256": {
    tag: "(0008,2256)",
    vr: "ST",
    vm: "1",
    name: "AnatomicPerspectiveDescriptionTrial"
  },
  "00082257": {
    tag: "(0008,2257)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicPerspectiveCodeSequenceTrial"
  },
  "00082258": {
    tag: "(0008,2258)",
    vr: "ST",
    vm: "1",
    name: "AnatomicLocationOfExaminingInstrumentDescriptionTrial"
  },
  "00082259": {
    tag: "(0008,2259)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicLocationOfExaminingInstrumentCodeSequenceTrial"
  },
  "0008225A": {
    tag: "(0008,225A)",
    vr: "SQ",
    vm: "1",
    name: "AnatomicStructureSpaceOrRegionModifierCodeSequenceTrial"
  },
  "0008225C": {
    tag: "(0008,225C)",
    vr: "SQ",
    vm: "1",
    name: "OnAxisBackgroundAnatomicStructureCodeSequenceTrial"
  },
  "00083001": {
    tag: "(0008,3001)",
    vr: "SQ",
    vm: "1",
    name: "AlternateRepresentationSequence"
  },
  "00083010": {
    tag: "(0008,3010)",
    vr: "UI",
    vm: "1-n",
    name: "IrradiationEventUID"
  },
  "00083011": {
    tag: "(0008,3011)",
    vr: "SQ",
    vm: "1",
    name: "SourceIrradiationEventSequence"
  },
  "00083012": {
    tag: "(0008,3012)",
    vr: "UI",
    vm: "1",
    name: "RadiopharmaceuticalAdministrationEventUID"
  },
  "00084000": {
    tag: "(0008,4000)",
    vr: "LT",
    vm: "1",
    name: "IdentifyingComments"
  },
  "00089007": {
    tag: "(0008,9007)",
    vr: "CS",
    vm: "4",
    name: "FrameType"
  },
  "00089092": {
    tag: "(0008,9092)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedImageEvidenceSequence"
  },
  "00089121": {
    tag: "(0008,9121)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedRawDataSequence"
  },
  "00089123": {
    tag: "(0008,9123)",
    vr: "UI",
    vm: "1",
    name: "CreatorVersionUID"
  },
  "00089124": {
    tag: "(0008,9124)",
    vr: "SQ",
    vm: "1",
    name: "DerivationImageSequence"
  },
  "00089154": {
    tag: "(0008,9154)",
    vr: "SQ",
    vm: "1",
    name: "SourceImageEvidenceSequence"
  },
  "00089205": {
    tag: "(0008,9205)",
    vr: "CS",
    vm: "1",
    name: "PixelPresentation"
  },
  "00089206": {
    tag: "(0008,9206)",
    vr: "CS",
    vm: "1",
    name: "VolumetricProperties"
  },
  "00089207": {
    tag: "(0008,9207)",
    vr: "CS",
    vm: "1",
    name: "VolumeBasedCalculationTechnique"
  },
  "00089208": {
    tag: "(0008,9208)",
    vr: "CS",
    vm: "1",
    name: "ComplexImageComponent"
  },
  "00089209": {
    tag: "(0008,9209)",
    vr: "CS",
    vm: "1",
    name: "AcquisitionContrast"
  },
  "00089215": {
    tag: "(0008,9215)",
    vr: "SQ",
    vm: "1",
    name: "DerivationCodeSequence"
  },
  "00089237": {
    tag: "(0008,9237)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPresentationStateSequence"
  },
  "00089410": {
    tag: "(0008,9410)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedOtherPlaneSequence"
  },
  "00089458": {
    tag: "(0008,9458)",
    vr: "SQ",
    vm: "1",
    name: "FrameDisplaySequence"
  },
  "00089459": {
    tag: "(0008,9459)",
    vr: "FL",
    vm: "1",
    name: "RecommendedDisplayFrameRateInFloat"
  },
  "00089460": {
    tag: "(0008,9460)",
    vr: "CS",
    vm: "1",
    name: "SkipFrameRangeFlag"
  },
  "00100010": {
    tag: "(0010,0010)",
    vr: "PN",
    vm: "1",
    name: "PatientName"
  },
  "00100020": {
    tag: "(0010,0020)",
    vr: "LO",
    vm: "1",
    name: "PatientID"
  },
  "00100021": {
    tag: "(0010,0021)",
    vr: "LO",
    vm: "1",
    name: "IssuerOfPatientID"
  },
  "00100022": {
    tag: "(0010,0022)",
    vr: "CS",
    vm: "1",
    name: "TypeOfPatientID"
  },
  "00100024": {
    tag: "(0010,0024)",
    vr: "SQ",
    vm: "1",
    name: "IssuerOfPatientIDQualifiersSequence"
  },
  "00100026": {
    tag: "(0010,0026)",
    vr: "SQ",
    vm: "1",
    name: "SourcePatientGroupIdentificationSequence"
  },
  "00100027": {
    tag: "(0010,0027)",
    vr: "SQ",
    vm: "1",
    name: "GroupOfPatientsIdentificationSequence"
  },
  "00100028": {
    tag: "(0010,0028)",
    vr: "US",
    vm: "3",
    name: "SubjectRelativePositionInImage"
  },
  "00100030": {
    tag: "(0010,0030)",
    vr: "DA",
    vm: "1",
    name: "PatientBirthDate"
  },
  "00100032": {
    tag: "(0010,0032)",
    vr: "TM",
    vm: "1",
    name: "PatientBirthTime"
  },
  "00100033": {
    tag: "(0010,0033)",
    vr: "LO",
    vm: "1",
    name: "PatientBirthDateInAlternativeCalendar"
  },
  "00100034": {
    tag: "(0010,0034)",
    vr: "LO",
    vm: "1",
    name: "PatientDeathDateInAlternativeCalendar"
  },
  "00100035": {
    tag: "(0010,0035)",
    vr: "CS",
    vm: "1",
    name: "PatientAlternativeCalendar"
  },
  "00100040": {
    tag: "(0010,0040)",
    vr: "CS",
    vm: "1",
    name: "PatientSex"
  },
  "00100050": {
    tag: "(0010,0050)",
    vr: "SQ",
    vm: "1",
    name: "PatientInsurancePlanCodeSequence"
  },
  "00100101": {
    tag: "(0010,0101)",
    vr: "SQ",
    vm: "1",
    name: "PatientPrimaryLanguageCodeSequence"
  },
  "00100102": {
    tag: "(0010,0102)",
    vr: "SQ",
    vm: "1",
    name: "PatientPrimaryLanguageModifierCodeSequence"
  },
  "00100200": {
    tag: "(0010,0200)",
    vr: "CS",
    vm: "1",
    name: "QualityControlSubject"
  },
  "00100201": {
    tag: "(0010,0201)",
    vr: "SQ",
    vm: "1",
    name: "QualityControlSubjectTypeCodeSequence"
  },
  "00100212": {
    tag: "(0010,0212)",
    vr: "UC",
    vm: "1",
    name: "StrainDescription"
  },
  "00100213": {
    tag: "(0010,0213)",
    vr: "LO",
    vm: "1",
    name: "StrainNomenclature"
  },
  "00100214": {
    tag: "(0010,0214)",
    vr: "LO",
    vm: "1",
    name: "StrainStockNumber"
  },
  "00100215": {
    tag: "(0010,0215)",
    vr: "SQ",
    vm: "1",
    name: "StrainSourceRegistryCodeSequence"
  },
  "00100216": {
    tag: "(0010,0216)",
    vr: "SQ",
    vm: "1",
    name: "StrainStockSequence"
  },
  "00100217": {
    tag: "(0010,0217)",
    vr: "LO",
    vm: "1",
    name: "StrainSource"
  },
  "00100218": {
    tag: "(0010,0218)",
    vr: "UT",
    vm: "1",
    name: "StrainAdditionalInformation"
  },
  "00100219": {
    tag: "(0010,0219)",
    vr: "SQ",
    vm: "1",
    name: "StrainCodeSequence"
  },
  "00100221": {
    tag: "(0010,0221)",
    vr: "SQ",
    vm: "1",
    name: "GeneticModificationsSequence"
  },
  "00100222": {
    tag: "(0010,0222)",
    vr: "UC",
    vm: "1",
    name: "GeneticModificationsDescription"
  },
  "00100223": {
    tag: "(0010,0223)",
    vr: "LO",
    vm: "1",
    name: "GeneticModificationsNomenclature"
  },
  "00100229": {
    tag: "(0010,0229)",
    vr: "SQ",
    vm: "1",
    name: "GeneticModificationsCodeSequence"
  },
  "00101000": {
    tag: "(0010,1000)",
    vr: "LO",
    vm: "1-n",
    name: "OtherPatientIDs"
  },
  "00101001": {
    tag: "(0010,1001)",
    vr: "PN",
    vm: "1-n",
    name: "OtherPatientNames"
  },
  "00101002": {
    tag: "(0010,1002)",
    vr: "SQ",
    vm: "1",
    name: "OtherPatientIDsSequence"
  },
  "00101005": {
    tag: "(0010,1005)",
    vr: "PN",
    vm: "1",
    name: "PatientBirthName"
  },
  "00101010": {
    tag: "(0010,1010)",
    vr: "AS",
    vm: "1",
    name: "PatientAge"
  },
  "00101020": {
    tag: "(0010,1020)",
    vr: "DS",
    vm: "1",
    name: "PatientSize"
  },
  "00101021": {
    tag: "(0010,1021)",
    vr: "SQ",
    vm: "1",
    name: "PatientSizeCodeSequence"
  },
  "00101022": {
    tag: "(0010,1022)",
    vr: "DS",
    vm: "1",
    name: "PatientBodyMassIndex"
  },
  "00101023": {
    tag: "(0010,1023)",
    vr: "DS",
    vm: "1",
    name: "MeasuredAPDimension"
  },
  "00101024": {
    tag: "(0010,1024)",
    vr: "DS",
    vm: "1",
    name: "MeasuredLateralDimension"
  },
  "00101030": {
    tag: "(0010,1030)",
    vr: "DS",
    vm: "1",
    name: "PatientWeight"
  },
  "00101040": {
    tag: "(0010,1040)",
    vr: "LO",
    vm: "1",
    name: "PatientAddress"
  },
  "00101050": {
    tag: "(0010,1050)",
    vr: "LO",
    vm: "1-n",
    name: "InsurancePlanIdentification"
  },
  "00101060": {
    tag: "(0010,1060)",
    vr: "PN",
    vm: "1",
    name: "PatientMotherBirthName"
  },
  "00101080": {
    tag: "(0010,1080)",
    vr: "LO",
    vm: "1",
    name: "MilitaryRank"
  },
  "00101081": {
    tag: "(0010,1081)",
    vr: "LO",
    vm: "1",
    name: "BranchOfService"
  },
  "00101090": {
    tag: "(0010,1090)",
    vr: "LO",
    vm: "1",
    name: "MedicalRecordLocator"
  },
  "00101100": {
    tag: "(0010,1100)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPatientPhotoSequence"
  },
  "00102000": {
    tag: "(0010,2000)",
    vr: "LO",
    vm: "1-n",
    name: "MedicalAlerts"
  },
  "00102110": {
    tag: "(0010,2110)",
    vr: "LO",
    vm: "1-n",
    name: "Allergies"
  },
  "00102150": {
    tag: "(0010,2150)",
    vr: "LO",
    vm: "1",
    name: "CountryOfResidence"
  },
  "00102152": {
    tag: "(0010,2152)",
    vr: "LO",
    vm: "1",
    name: "RegionOfResidence"
  },
  "00102154": {
    tag: "(0010,2154)",
    vr: "SH",
    vm: "1-n",
    name: "PatientTelephoneNumbers"
  },
  "00102155": {
    tag: "(0010,2155)",
    vr: "LT",
    vm: "1",
    name: "PatientTelecomInformation"
  },
  "00102160": {
    tag: "(0010,2160)",
    vr: "SH",
    vm: "1",
    name: "EthnicGroup"
  },
  "00102180": {
    tag: "(0010,2180)",
    vr: "SH",
    vm: "1",
    name: "Occupation"
  },
  "001021A0": {
    tag: "(0010,21A0)",
    vr: "CS",
    vm: "1",
    name: "SmokingStatus"
  },
  "001021B0": {
    tag: "(0010,21B0)",
    vr: "LT",
    vm: "1",
    name: "AdditionalPatientHistory"
  },
  "001021C0": {
    tag: "(0010,21C0)",
    vr: "US",
    vm: "1",
    name: "PregnancyStatus"
  },
  "001021D0": {
    tag: "(0010,21D0)",
    vr: "DA",
    vm: "1",
    name: "LastMenstrualDate"
  },
  "001021F0": {
    tag: "(0010,21F0)",
    vr: "LO",
    vm: "1",
    name: "PatientReligiousPreference"
  },
  "00102201": {
    tag: "(0010,2201)",
    vr: "LO",
    vm: "1",
    name: "PatientSpeciesDescription"
  },
  "00102202": {
    tag: "(0010,2202)",
    vr: "SQ",
    vm: "1",
    name: "PatientSpeciesCodeSequence"
  },
  "00102203": {
    tag: "(0010,2203)",
    vr: "CS",
    vm: "1",
    name: "PatientSexNeutered"
  },
  "00102210": {
    tag: "(0010,2210)",
    vr: "CS",
    vm: "1",
    name: "AnatomicalOrientationType"
  },
  "00102292": {
    tag: "(0010,2292)",
    vr: "LO",
    vm: "1",
    name: "PatientBreedDescription"
  },
  "00102293": {
    tag: "(0010,2293)",
    vr: "SQ",
    vm: "1",
    name: "PatientBreedCodeSequence"
  },
  "00102294": {
    tag: "(0010,2294)",
    vr: "SQ",
    vm: "1",
    name: "BreedRegistrationSequence"
  },
  "00102295": {
    tag: "(0010,2295)",
    vr: "LO",
    vm: "1",
    name: "BreedRegistrationNumber"
  },
  "00102296": {
    tag: "(0010,2296)",
    vr: "SQ",
    vm: "1",
    name: "BreedRegistryCodeSequence"
  },
  "00102297": {
    tag: "(0010,2297)",
    vr: "PN",
    vm: "1",
    name: "ResponsiblePerson"
  },
  "00102298": {
    tag: "(0010,2298)",
    vr: "CS",
    vm: "1",
    name: "ResponsiblePersonRole"
  },
  "00102299": {
    tag: "(0010,2299)",
    vr: "LO",
    vm: "1",
    name: "ResponsibleOrganization"
  },
  "00104000": {
    tag: "(0010,4000)",
    vr: "LT",
    vm: "1",
    name: "PatientComments"
  },
  "00109431": {
    tag: "(0010,9431)",
    vr: "FL",
    vm: "1",
    name: "ExaminedBodyThickness"
  },
  "00120010": {
    tag: "(0012,0010)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialSponsorName"
  },
  "00120020": {
    tag: "(0012,0020)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialProtocolID"
  },
  "00120021": {
    tag: "(0012,0021)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialProtocolName"
  },
  "00120030": {
    tag: "(0012,0030)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialSiteID"
  },
  "00120031": {
    tag: "(0012,0031)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialSiteName"
  },
  "00120040": {
    tag: "(0012,0040)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialSubjectID"
  },
  "00120042": {
    tag: "(0012,0042)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialSubjectReadingID"
  },
  "00120050": {
    tag: "(0012,0050)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialTimePointID"
  },
  "00120051": {
    tag: "(0012,0051)",
    vr: "ST",
    vm: "1",
    name: "ClinicalTrialTimePointDescription"
  },
  "00120052": {
    tag: "(0012,0052)",
    vr: "FD",
    vm: "1",
    name: "LongitudinalTemporalOffsetFromEvent"
  },
  "00120053": {
    tag: "(0012,0053)",
    vr: "CS",
    vm: "1",
    name: "LongitudinalTemporalEventType"
  },
  "00120060": {
    tag: "(0012,0060)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialCoordinatingCenterName"
  },
  "00120062": {
    tag: "(0012,0062)",
    vr: "CS",
    vm: "1",
    name: "PatientIdentityRemoved"
  },
  "00120063": {
    tag: "(0012,0063)",
    vr: "LO",
    vm: "1-n",
    name: "DeidentificationMethod"
  },
  "00120064": {
    tag: "(0012,0064)",
    vr: "SQ",
    vm: "1",
    name: "DeidentificationMethodCodeSequence"
  },
  "00120071": {
    tag: "(0012,0071)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialSeriesID"
  },
  "00120072": {
    tag: "(0012,0072)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialSeriesDescription"
  },
  "00120081": {
    tag: "(0012,0081)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialProtocolEthicsCommitteeName"
  },
  "00120082": {
    tag: "(0012,0082)",
    vr: "LO",
    vm: "1",
    name: "ClinicalTrialProtocolEthicsCommitteeApprovalNumber"
  },
  "00120083": {
    tag: "(0012,0083)",
    vr: "SQ",
    vm: "1",
    name: "ConsentForClinicalTrialUseSequence"
  },
  "00120084": {
    tag: "(0012,0084)",
    vr: "CS",
    vm: "1",
    name: "DistributionType"
  },
  "00120085": {
    tag: "(0012,0085)",
    vr: "CS",
    vm: "1",
    name: "ConsentForDistributionFlag"
  },
  "00120086": {
    tag: "(0012,0086)",
    vr: "DA",
    vm: "1",
    name: "EthicsCommitteeApprovalEffectivenessStartDate"
  },
  "00120087": {
    tag: "(0012,0087)",
    vr: "DA",
    vm: "1",
    name: "EthicsCommitteeApprovalEffectivenessEndDate"
  },
  "00140023": {
    tag: "(0014,0023)",
    vr: "ST",
    vm: "1",
    name: "CADFileFormat"
  },
  "00140024": {
    tag: "(0014,0024)",
    vr: "ST",
    vm: "1",
    name: "ComponentReferenceSystem"
  },
  "00140025": {
    tag: "(0014,0025)",
    vr: "ST",
    vm: "1",
    name: "ComponentManufacturingProcedure"
  },
  "00140028": {
    tag: "(0014,0028)",
    vr: "ST",
    vm: "1",
    name: "ComponentManufacturer"
  },
  "00140030": {
    tag: "(0014,0030)",
    vr: "DS",
    vm: "1-n",
    name: "MaterialThickness"
  },
  "00140032": {
    tag: "(0014,0032)",
    vr: "DS",
    vm: "1-n",
    name: "MaterialPipeDiameter"
  },
  "00140034": {
    tag: "(0014,0034)",
    vr: "DS",
    vm: "1-n",
    name: "MaterialIsolationDiameter"
  },
  "00140042": {
    tag: "(0014,0042)",
    vr: "ST",
    vm: "1",
    name: "MaterialGrade"
  },
  "00140044": {
    tag: "(0014,0044)",
    vr: "ST",
    vm: "1",
    name: "MaterialPropertiesDescription"
  },
  "00140045": {
    tag: "(0014,0045)",
    vr: "ST",
    vm: "1",
    name: "MaterialPropertiesFileFormatRetired"
  },
  "00140046": {
    tag: "(0014,0046)",
    vr: "LT",
    vm: "1",
    name: "MaterialNotes"
  },
  "00140050": {
    tag: "(0014,0050)",
    vr: "CS",
    vm: "1",
    name: "ComponentShape"
  },
  "00140052": {
    tag: "(0014,0052)",
    vr: "CS",
    vm: "1",
    name: "CurvatureType"
  },
  "00140054": {
    tag: "(0014,0054)",
    vr: "DS",
    vm: "1",
    name: "OuterDiameter"
  },
  "00140056": {
    tag: "(0014,0056)",
    vr: "DS",
    vm: "1",
    name: "InnerDiameter"
  },
  "00140100": {
    tag: "(0014,0100)",
    vr: "LO",
    vm: "1-n",
    name: "ComponentWelderIDs"
  },
  "00140101": {
    tag: "(0014,0101)",
    vr: "CS",
    vm: "1",
    name: "SecondaryApprovalStatus"
  },
  "00140102": {
    tag: "(0014,0102)",
    vr: "DA",
    vm: "1",
    name: "SecondaryReviewDate"
  },
  "00140103": {
    tag: "(0014,0103)",
    vr: "TM",
    vm: "1",
    name: "SecondaryReviewTime"
  },
  "00140104": {
    tag: "(0014,0104)",
    vr: "PN",
    vm: "1",
    name: "SecondaryReviewerName"
  },
  "00140105": {
    tag: "(0014,0105)",
    vr: "ST",
    vm: "1",
    name: "RepairID"
  },
  "00140106": {
    tag: "(0014,0106)",
    vr: "SQ",
    vm: "1",
    name: "MultipleComponentApprovalSequence"
  },
  "00140107": {
    tag: "(0014,0107)",
    vr: "CS",
    vm: "1-n",
    name: "OtherApprovalStatus"
  },
  "00140108": {
    tag: "(0014,0108)",
    vr: "CS",
    vm: "1-n",
    name: "OtherSecondaryApprovalStatus"
  },
  "00141010": {
    tag: "(0014,1010)",
    vr: "ST",
    vm: "1",
    name: "ActualEnvironmentalConditions"
  },
  "00141020": {
    tag: "(0014,1020)",
    vr: "DA",
    vm: "1",
    name: "ExpiryDate"
  },
  "00141040": {
    tag: "(0014,1040)",
    vr: "ST",
    vm: "1",
    name: "EnvironmentalConditions"
  },
  "00142002": {
    tag: "(0014,2002)",
    vr: "SQ",
    vm: "1",
    name: "EvaluatorSequence"
  },
  "00142004": {
    tag: "(0014,2004)",
    vr: "IS",
    vm: "1",
    name: "EvaluatorNumber"
  },
  "00142006": {
    tag: "(0014,2006)",
    vr: "PN",
    vm: "1",
    name: "EvaluatorName"
  },
  "00142008": {
    tag: "(0014,2008)",
    vr: "IS",
    vm: "1",
    name: "EvaluationAttempt"
  },
  "00142012": {
    tag: "(0014,2012)",
    vr: "SQ",
    vm: "1",
    name: "IndicationSequence"
  },
  "00142014": {
    tag: "(0014,2014)",
    vr: "IS",
    vm: "1",
    name: "IndicationNumber"
  },
  "00142016": {
    tag: "(0014,2016)",
    vr: "SH",
    vm: "1",
    name: "IndicationLabel"
  },
  "00142018": {
    tag: "(0014,2018)",
    vr: "ST",
    vm: "1",
    name: "IndicationDescription"
  },
  "0014201A": {
    tag: "(0014,201A)",
    vr: "CS",
    vm: "1-n",
    name: "IndicationType"
  },
  "0014201C": {
    tag: "(0014,201C)",
    vr: "CS",
    vm: "1",
    name: "IndicationDisposition"
  },
  "0014201E": {
    tag: "(0014,201E)",
    vr: "SQ",
    vm: "1",
    name: "IndicationROISequence"
  },
  "00142030": {
    tag: "(0014,2030)",
    vr: "SQ",
    vm: "1",
    name: "IndicationPhysicalPropertySequence"
  },
  "00142032": {
    tag: "(0014,2032)",
    vr: "SH",
    vm: "1",
    name: "PropertyLabel"
  },
  "00142202": {
    tag: "(0014,2202)",
    vr: "IS",
    vm: "1",
    name: "CoordinateSystemNumberOfAxes"
  },
  "00142204": {
    tag: "(0014,2204)",
    vr: "SQ",
    vm: "1",
    name: "CoordinateSystemAxesSequence"
  },
  "00142206": {
    tag: "(0014,2206)",
    vr: "ST",
    vm: "1",
    name: "CoordinateSystemAxisDescription"
  },
  "00142208": {
    tag: "(0014,2208)",
    vr: "CS",
    vm: "1",
    name: "CoordinateSystemDataSetMapping"
  },
  "0014220A": {
    tag: "(0014,220A)",
    vr: "IS",
    vm: "1",
    name: "CoordinateSystemAxisNumber"
  },
  "0014220C": {
    tag: "(0014,220C)",
    vr: "CS",
    vm: "1",
    name: "CoordinateSystemAxisType"
  },
  "0014220E": {
    tag: "(0014,220E)",
    vr: "CS",
    vm: "1",
    name: "CoordinateSystemAxisUnits"
  },
  "00142210": {
    tag: "(0014,2210)",
    vr: "OB",
    vm: "1",
    name: "CoordinateSystemAxisValues"
  },
  "00142220": {
    tag: "(0014,2220)",
    vr: "SQ",
    vm: "1",
    name: "CoordinateSystemTransformSequence"
  },
  "00142222": {
    tag: "(0014,2222)",
    vr: "ST",
    vm: "1",
    name: "TransformDescription"
  },
  "00142224": {
    tag: "(0014,2224)",
    vr: "IS",
    vm: "1",
    name: "TransformNumberOfAxes"
  },
  "00142226": {
    tag: "(0014,2226)",
    vr: "IS",
    vm: "1-n",
    name: "TransformOrderOfAxes"
  },
  "00142228": {
    tag: "(0014,2228)",
    vr: "CS",
    vm: "1",
    name: "TransformedAxisUnits"
  },
  "0014222A": {
    tag: "(0014,222A)",
    vr: "DS",
    vm: "1-n",
    name: "CoordinateSystemTransformRotationAndScaleMatrix"
  },
  "0014222C": {
    tag: "(0014,222C)",
    vr: "DS",
    vm: "1-n",
    name: "CoordinateSystemTransformTranslationMatrix"
  },
  "00143011": {
    tag: "(0014,3011)",
    vr: "DS",
    vm: "1",
    name: "InternalDetectorFrameTime"
  },
  "00143012": {
    tag: "(0014,3012)",
    vr: "DS",
    vm: "1",
    name: "NumberOfFramesIntegrated"
  },
  "00143020": {
    tag: "(0014,3020)",
    vr: "SQ",
    vm: "1",
    name: "DetectorTemperatureSequence"
  },
  "00143022": {
    tag: "(0014,3022)",
    vr: "ST",
    vm: "1",
    name: "SensorName"
  },
  "00143024": {
    tag: "(0014,3024)",
    vr: "DS",
    vm: "1",
    name: "HorizontalOffsetOfSensor"
  },
  "00143026": {
    tag: "(0014,3026)",
    vr: "DS",
    vm: "1",
    name: "VerticalOffsetOfSensor"
  },
  "00143028": {
    tag: "(0014,3028)",
    vr: "DS",
    vm: "1",
    name: "SensorTemperature"
  },
  "00143040": {
    tag: "(0014,3040)",
    vr: "SQ",
    vm: "1",
    name: "DarkCurrentSequence"
  },
  "00143050": {
    tag: "(0014,3050)",
    vr: "OB|OW",
    vm: "1",
    name: "DarkCurrentCounts"
  },
  "00143060": {
    tag: "(0014,3060)",
    vr: "SQ",
    vm: "1",
    name: "GainCorrectionReferenceSequence"
  },
  "00143070": {
    tag: "(0014,3070)",
    vr: "OB|OW",
    vm: "1",
    name: "AirCounts"
  },
  "00143071": {
    tag: "(0014,3071)",
    vr: "DS",
    vm: "1",
    name: "KVUsedInGainCalibration"
  },
  "00143072": {
    tag: "(0014,3072)",
    vr: "DS",
    vm: "1",
    name: "MAUsedInGainCalibration"
  },
  "00143073": {
    tag: "(0014,3073)",
    vr: "DS",
    vm: "1",
    name: "NumberOfFramesUsedForIntegration"
  },
  "00143074": {
    tag: "(0014,3074)",
    vr: "LO",
    vm: "1",
    name: "FilterMaterialUsedInGainCalibration"
  },
  "00143075": {
    tag: "(0014,3075)",
    vr: "DS",
    vm: "1",
    name: "FilterThicknessUsedInGainCalibration"
  },
  "00143076": {
    tag: "(0014,3076)",
    vr: "DA",
    vm: "1",
    name: "DateOfGainCalibration"
  },
  "00143077": {
    tag: "(0014,3077)",
    vr: "TM",
    vm: "1",
    name: "TimeOfGainCalibration"
  },
  "00143080": {
    tag: "(0014,3080)",
    vr: "OB",
    vm: "1",
    name: "BadPixelImage"
  },
  "00143099": {
    tag: "(0014,3099)",
    vr: "LT",
    vm: "1",
    name: "CalibrationNotes"
  },
  "00144002": {
    tag: "(0014,4002)",
    vr: "SQ",
    vm: "1",
    name: "PulserEquipmentSequence"
  },
  "00144004": {
    tag: "(0014,4004)",
    vr: "CS",
    vm: "1",
    name: "PulserType"
  },
  "00144006": {
    tag: "(0014,4006)",
    vr: "LT",
    vm: "1",
    name: "PulserNotes"
  },
  "00144008": {
    tag: "(0014,4008)",
    vr: "SQ",
    vm: "1",
    name: "ReceiverEquipmentSequence"
  },
  "0014400A": {
    tag: "(0014,400A)",
    vr: "CS",
    vm: "1",
    name: "AmplifierType"
  },
  "0014400C": {
    tag: "(0014,400C)",
    vr: "LT",
    vm: "1",
    name: "ReceiverNotes"
  },
  "0014400E": {
    tag: "(0014,400E)",
    vr: "SQ",
    vm: "1",
    name: "PreAmplifierEquipmentSequence"
  },
  "0014400F": {
    tag: "(0014,400F)",
    vr: "LT",
    vm: "1",
    name: "PreAmplifierNotes"
  },
  "00144010": {
    tag: "(0014,4010)",
    vr: "SQ",
    vm: "1",
    name: "TransmitTransducerSequence"
  },
  "00144011": {
    tag: "(0014,4011)",
    vr: "SQ",
    vm: "1",
    name: "ReceiveTransducerSequence"
  },
  "00144012": {
    tag: "(0014,4012)",
    vr: "US",
    vm: "1",
    name: "NumberOfElements"
  },
  "00144013": {
    tag: "(0014,4013)",
    vr: "CS",
    vm: "1",
    name: "ElementShape"
  },
  "00144014": {
    tag: "(0014,4014)",
    vr: "DS",
    vm: "1",
    name: "ElementDimensionA"
  },
  "00144015": {
    tag: "(0014,4015)",
    vr: "DS",
    vm: "1",
    name: "ElementDimensionB"
  },
  "00144016": {
    tag: "(0014,4016)",
    vr: "DS",
    vm: "1",
    name: "ElementPitchA"
  },
  "00144017": {
    tag: "(0014,4017)",
    vr: "DS",
    vm: "1",
    name: "MeasuredBeamDimensionA"
  },
  "00144018": {
    tag: "(0014,4018)",
    vr: "DS",
    vm: "1",
    name: "MeasuredBeamDimensionB"
  },
  "00144019": {
    tag: "(0014,4019)",
    vr: "DS",
    vm: "1",
    name: "LocationOfMeasuredBeamDiameter"
  },
  "0014401A": {
    tag: "(0014,401A)",
    vr: "DS",
    vm: "1",
    name: "NominalFrequency"
  },
  "0014401B": {
    tag: "(0014,401B)",
    vr: "DS",
    vm: "1",
    name: "MeasuredCenterFrequency"
  },
  "0014401C": {
    tag: "(0014,401C)",
    vr: "DS",
    vm: "1",
    name: "MeasuredBandwidth"
  },
  "0014401D": {
    tag: "(0014,401D)",
    vr: "DS",
    vm: "1",
    name: "ElementPitchB"
  },
  "00144020": {
    tag: "(0014,4020)",
    vr: "SQ",
    vm: "1",
    name: "PulserSettingsSequence"
  },
  "00144022": {
    tag: "(0014,4022)",
    vr: "DS",
    vm: "1",
    name: "PulseWidth"
  },
  "00144024": {
    tag: "(0014,4024)",
    vr: "DS",
    vm: "1",
    name: "ExcitationFrequency"
  },
  "00144026": {
    tag: "(0014,4026)",
    vr: "CS",
    vm: "1",
    name: "ModulationType"
  },
  "00144028": {
    tag: "(0014,4028)",
    vr: "DS",
    vm: "1",
    name: "Damping"
  },
  "00144030": {
    tag: "(0014,4030)",
    vr: "SQ",
    vm: "1",
    name: "ReceiverSettingsSequence"
  },
  "00144031": {
    tag: "(0014,4031)",
    vr: "DS",
    vm: "1",
    name: "AcquiredSoundpathLength"
  },
  "00144032": {
    tag: "(0014,4032)",
    vr: "CS",
    vm: "1",
    name: "AcquisitionCompressionType"
  },
  "00144033": {
    tag: "(0014,4033)",
    vr: "IS",
    vm: "1",
    name: "AcquisitionSampleSize"
  },
  "00144034": {
    tag: "(0014,4034)",
    vr: "DS",
    vm: "1",
    name: "RectifierSmoothing"
  },
  "00144035": {
    tag: "(0014,4035)",
    vr: "SQ",
    vm: "1",
    name: "DACSequence"
  },
  "00144036": {
    tag: "(0014,4036)",
    vr: "CS",
    vm: "1",
    name: "DACType"
  },
  "00144038": {
    tag: "(0014,4038)",
    vr: "DS",
    vm: "1-n",
    name: "DACGainPoints"
  },
  "0014403A": {
    tag: "(0014,403A)",
    vr: "DS",
    vm: "1-n",
    name: "DACTimePoints"
  },
  "0014403C": {
    tag: "(0014,403C)",
    vr: "DS",
    vm: "1-n",
    name: "DACAmplitude"
  },
  "00144040": {
    tag: "(0014,4040)",
    vr: "SQ",
    vm: "1",
    name: "PreAmplifierSettingsSequence"
  },
  "00144050": {
    tag: "(0014,4050)",
    vr: "SQ",
    vm: "1",
    name: "TransmitTransducerSettingsSequence"
  },
  "00144051": {
    tag: "(0014,4051)",
    vr: "SQ",
    vm: "1",
    name: "ReceiveTransducerSettingsSequence"
  },
  "00144052": {
    tag: "(0014,4052)",
    vr: "DS",
    vm: "1",
    name: "IncidentAngle"
  },
  "00144054": {
    tag: "(0014,4054)",
    vr: "ST",
    vm: "1",
    name: "CouplingTechnique"
  },
  "00144056": {
    tag: "(0014,4056)",
    vr: "ST",
    vm: "1",
    name: "CouplingMedium"
  },
  "00144057": {
    tag: "(0014,4057)",
    vr: "DS",
    vm: "1",
    name: "CouplingVelocity"
  },
  "00144058": {
    tag: "(0014,4058)",
    vr: "DS",
    vm: "1",
    name: "ProbeCenterLocationX"
  },
  "00144059": {
    tag: "(0014,4059)",
    vr: "DS",
    vm: "1",
    name: "ProbeCenterLocationZ"
  },
  "0014405A": {
    tag: "(0014,405A)",
    vr: "DS",
    vm: "1",
    name: "SoundPathLength"
  },
  "0014405C": {
    tag: "(0014,405C)",
    vr: "ST",
    vm: "1",
    name: "DelayLawIdentifier"
  },
  "00144060": {
    tag: "(0014,4060)",
    vr: "SQ",
    vm: "1",
    name: "GateSettingsSequence"
  },
  "00144062": {
    tag: "(0014,4062)",
    vr: "DS",
    vm: "1",
    name: "GateThreshold"
  },
  "00144064": {
    tag: "(0014,4064)",
    vr: "DS",
    vm: "1",
    name: "VelocityOfSound"
  },
  "00144070": {
    tag: "(0014,4070)",
    vr: "SQ",
    vm: "1",
    name: "CalibrationSettingsSequence"
  },
  "00144072": {
    tag: "(0014,4072)",
    vr: "ST",
    vm: "1",
    name: "CalibrationProcedure"
  },
  "00144074": {
    tag: "(0014,4074)",
    vr: "SH",
    vm: "1",
    name: "ProcedureVersion"
  },
  "00144076": {
    tag: "(0014,4076)",
    vr: "DA",
    vm: "1",
    name: "ProcedureCreationDate"
  },
  "00144078": {
    tag: "(0014,4078)",
    vr: "DA",
    vm: "1",
    name: "ProcedureExpirationDate"
  },
  "0014407A": {
    tag: "(0014,407A)",
    vr: "DA",
    vm: "1",
    name: "ProcedureLastModifiedDate"
  },
  "0014407C": {
    tag: "(0014,407C)",
    vr: "TM",
    vm: "1-n",
    name: "CalibrationTime"
  },
  "0014407E": {
    tag: "(0014,407E)",
    vr: "DA",
    vm: "1-n",
    name: "CalibrationDate"
  },
  "00144080": {
    tag: "(0014,4080)",
    vr: "SQ",
    vm: "1",
    name: "ProbeDriveEquipmentSequence"
  },
  "00144081": {
    tag: "(0014,4081)",
    vr: "CS",
    vm: "1",
    name: "DriveType"
  },
  "00144082": {
    tag: "(0014,4082)",
    vr: "LT",
    vm: "1",
    name: "ProbeDriveNotes"
  },
  "00144083": {
    tag: "(0014,4083)",
    vr: "SQ",
    vm: "1",
    name: "DriveProbeSequence"
  },
  "00144084": {
    tag: "(0014,4084)",
    vr: "DS",
    vm: "1",
    name: "ProbeInductance"
  },
  "00144085": {
    tag: "(0014,4085)",
    vr: "DS",
    vm: "1",
    name: "ProbeResistance"
  },
  "00144086": {
    tag: "(0014,4086)",
    vr: "SQ",
    vm: "1",
    name: "ReceiveProbeSequence"
  },
  "00144087": {
    tag: "(0014,4087)",
    vr: "SQ",
    vm: "1",
    name: "ProbeDriveSettingsSequence"
  },
  "00144088": {
    tag: "(0014,4088)",
    vr: "DS",
    vm: "1",
    name: "BridgeResistors"
  },
  "00144089": {
    tag: "(0014,4089)",
    vr: "DS",
    vm: "1",
    name: "ProbeOrientationAngle"
  },
  "0014408B": {
    tag: "(0014,408B)",
    vr: "DS",
    vm: "1",
    name: "UserSelectedGainY"
  },
  "0014408C": {
    tag: "(0014,408C)",
    vr: "DS",
    vm: "1",
    name: "UserSelectedPhase"
  },
  "0014408D": {
    tag: "(0014,408D)",
    vr: "DS",
    vm: "1",
    name: "UserSelectedOffsetX"
  },
  "0014408E": {
    tag: "(0014,408E)",
    vr: "DS",
    vm: "1",
    name: "UserSelectedOffsetY"
  },
  "00144091": {
    tag: "(0014,4091)",
    vr: "SQ",
    vm: "1",
    name: "ChannelSettingsSequence"
  },
  "00144092": {
    tag: "(0014,4092)",
    vr: "DS",
    vm: "1",
    name: "ChannelThreshold"
  },
  "0014409A": {
    tag: "(0014,409A)",
    vr: "SQ",
    vm: "1",
    name: "ScannerSettingsSequence"
  },
  "0014409B": {
    tag: "(0014,409B)",
    vr: "ST",
    vm: "1",
    name: "ScanProcedure"
  },
  "0014409C": {
    tag: "(0014,409C)",
    vr: "DS",
    vm: "1",
    name: "TranslationRateX"
  },
  "0014409D": {
    tag: "(0014,409D)",
    vr: "DS",
    vm: "1",
    name: "TranslationRateY"
  },
  "0014409F": {
    tag: "(0014,409F)",
    vr: "DS",
    vm: "1",
    name: "ChannelOverlap"
  },
  "001440A0": {
    tag: "(0014,40A0)",
    vr: "LO",
    vm: "1",
    name: "ImageQualityIndicatorType"
  },
  "001440A1": {
    tag: "(0014,40A1)",
    vr: "LO",
    vm: "1",
    name: "ImageQualityIndicatorMaterial"
  },
  "001440A2": {
    tag: "(0014,40A2)",
    vr: "LO",
    vm: "1",
    name: "ImageQualityIndicatorSize"
  },
  "00145002": {
    tag: "(0014,5002)",
    vr: "IS",
    vm: "1",
    name: "LINACEnergy"
  },
  "00145004": {
    tag: "(0014,5004)",
    vr: "IS",
    vm: "1",
    name: "LINACOutput"
  },
  "00145100": {
    tag: "(0014,5100)",
    vr: "US",
    vm: "1",
    name: "ActiveAperture"
  },
  "00145101": {
    tag: "(0014,5101)",
    vr: "DS",
    vm: "1",
    name: "TotalAperture"
  },
  "00145102": {
    tag: "(0014,5102)",
    vr: "DS",
    vm: "1",
    name: "ApertureElevation"
  },
  "00145103": {
    tag: "(0014,5103)",
    vr: "DS",
    vm: "1",
    name: "MainLobeAngle"
  },
  "00145104": {
    tag: "(0014,5104)",
    vr: "DS",
    vm: "1",
    name: "MainRoofAngle"
  },
  "00145105": {
    tag: "(0014,5105)",
    vr: "CS",
    vm: "1",
    name: "ConnectorType"
  },
  "00145106": {
    tag: "(0014,5106)",
    vr: "SH",
    vm: "1",
    name: "WedgeModelNumber"
  },
  "00145107": {
    tag: "(0014,5107)",
    vr: "DS",
    vm: "1",
    name: "WedgeAngleFloat"
  },
  "00145108": {
    tag: "(0014,5108)",
    vr: "DS",
    vm: "1",
    name: "WedgeRoofAngle"
  },
  "00145109": {
    tag: "(0014,5109)",
    vr: "CS",
    vm: "1",
    name: "WedgeElement1Position"
  },
  "0014510A": {
    tag: "(0014,510A)",
    vr: "DS",
    vm: "1",
    name: "WedgeMaterialVelocity"
  },
  "0014510B": {
    tag: "(0014,510B)",
    vr: "SH",
    vm: "1",
    name: "WedgeMaterial"
  },
  "0014510C": {
    tag: "(0014,510C)",
    vr: "DS",
    vm: "1",
    name: "WedgeOffsetZ"
  },
  "0014510D": {
    tag: "(0014,510D)",
    vr: "DS",
    vm: "1",
    name: "WedgeOriginOffsetX"
  },
  "0014510E": {
    tag: "(0014,510E)",
    vr: "DS",
    vm: "1",
    name: "WedgeTimeDelay"
  },
  "0014510F": {
    tag: "(0014,510F)",
    vr: "SH",
    vm: "1",
    name: "WedgeName"
  },
  "00145110": {
    tag: "(0014,5110)",
    vr: "SH",
    vm: "1",
    name: "WedgeManufacturerName"
  },
  "00145111": {
    tag: "(0014,5111)",
    vr: "LO",
    vm: "1",
    name: "WedgeDescription"
  },
  "00145112": {
    tag: "(0014,5112)",
    vr: "DS",
    vm: "1",
    name: "NominalBeamAngle"
  },
  "00145113": {
    tag: "(0014,5113)",
    vr: "DS",
    vm: "1",
    name: "WedgeOffsetX"
  },
  "00145114": {
    tag: "(0014,5114)",
    vr: "DS",
    vm: "1",
    name: "WedgeOffsetY"
  },
  "00145115": {
    tag: "(0014,5115)",
    vr: "DS",
    vm: "1",
    name: "WedgeTotalLength"
  },
  "00145116": {
    tag: "(0014,5116)",
    vr: "DS",
    vm: "1",
    name: "WedgeInContactLength"
  },
  "00145117": {
    tag: "(0014,5117)",
    vr: "DS",
    vm: "1",
    name: "WedgeFrontGap"
  },
  "00145118": {
    tag: "(0014,5118)",
    vr: "DS",
    vm: "1",
    name: "WedgeTotalHeight"
  },
  "00145119": {
    tag: "(0014,5119)",
    vr: "DS",
    vm: "1",
    name: "WedgeFrontHeight"
  },
  "0014511A": {
    tag: "(0014,511A)",
    vr: "DS",
    vm: "1",
    name: "WedgeRearHeight"
  },
  "0014511B": {
    tag: "(0014,511B)",
    vr: "DS",
    vm: "1",
    name: "WedgeTotalWidth"
  },
  "0014511C": {
    tag: "(0014,511C)",
    vr: "DS",
    vm: "1",
    name: "WedgeInContactWidth"
  },
  "0014511D": {
    tag: "(0014,511D)",
    vr: "DS",
    vm: "1",
    name: "WedgeChamferHeight"
  },
  "0014511E": {
    tag: "(0014,511E)",
    vr: "CS",
    vm: "1",
    name: "WedgeCurve"
  },
  "0014511F": {
    tag: "(0014,511F)",
    vr: "DS",
    vm: "1",
    name: "RadiusAlongWedge"
  },
  "00180010": {
    tag: "(0018,0010)",
    vr: "LO",
    vm: "1",
    name: "ContrastBolusAgent"
  },
  "00180012": {
    tag: "(0018,0012)",
    vr: "SQ",
    vm: "1",
    name: "ContrastBolusAgentSequence"
  },
  "00180013": {
    tag: "(0018,0013)",
    vr: "FL",
    vm: "1",
    name: "ContrastBolusT1Relaxivity"
  },
  "00180014": {
    tag: "(0018,0014)",
    vr: "SQ",
    vm: "1",
    name: "ContrastBolusAdministrationRouteSequence"
  },
  "00180015": {
    tag: "(0018,0015)",
    vr: "CS",
    vm: "1",
    name: "BodyPartExamined"
  },
  "00180020": {
    tag: "(0018,0020)",
    vr: "CS",
    vm: "1-n",
    name: "ScanningSequence"
  },
  "00180021": {
    tag: "(0018,0021)",
    vr: "CS",
    vm: "1-n",
    name: "SequenceVariant"
  },
  "00180022": {
    tag: "(0018,0022)",
    vr: "CS",
    vm: "1-n",
    name: "ScanOptions"
  },
  "00180023": {
    tag: "(0018,0023)",
    vr: "CS",
    vm: "1",
    name: "MRAcquisitionType"
  },
  "00180024": {
    tag: "(0018,0024)",
    vr: "SH",
    vm: "1",
    name: "SequenceName"
  },
  "00180025": {
    tag: "(0018,0025)",
    vr: "CS",
    vm: "1",
    name: "AngioFlag"
  },
  "00180026": {
    tag: "(0018,0026)",
    vr: "SQ",
    vm: "1",
    name: "InterventionDrugInformationSequence"
  },
  "00180027": {
    tag: "(0018,0027)",
    vr: "TM",
    vm: "1",
    name: "InterventionDrugStopTime"
  },
  "00180028": {
    tag: "(0018,0028)",
    vr: "DS",
    vm: "1",
    name: "InterventionDrugDose"
  },
  "00180029": {
    tag: "(0018,0029)",
    vr: "SQ",
    vm: "1",
    name: "InterventionDrugCodeSequence"
  },
  "0018002A": {
    tag: "(0018,002A)",
    vr: "SQ",
    vm: "1",
    name: "AdditionalDrugSequence"
  },
  "00180030": {
    tag: "(0018,0030)",
    vr: "LO",
    vm: "1-n",
    name: "Radionuclide"
  },
  "00180031": {
    tag: "(0018,0031)",
    vr: "LO",
    vm: "1",
    name: "Radiopharmaceutical"
  },
  "00180032": {
    tag: "(0018,0032)",
    vr: "DS",
    vm: "1",
    name: "EnergyWindowCenterline"
  },
  "00180033": {
    tag: "(0018,0033)",
    vr: "DS",
    vm: "1-n",
    name: "EnergyWindowTotalWidth"
  },
  "00180034": {
    tag: "(0018,0034)",
    vr: "LO",
    vm: "1",
    name: "InterventionDrugName"
  },
  "00180035": {
    tag: "(0018,0035)",
    vr: "TM",
    vm: "1",
    name: "InterventionDrugStartTime"
  },
  "00180036": {
    tag: "(0018,0036)",
    vr: "SQ",
    vm: "1",
    name: "InterventionSequence"
  },
  "00180037": {
    tag: "(0018,0037)",
    vr: "CS",
    vm: "1",
    name: "TherapyType"
  },
  "00180038": {
    tag: "(0018,0038)",
    vr: "CS",
    vm: "1",
    name: "InterventionStatus"
  },
  "00180039": {
    tag: "(0018,0039)",
    vr: "CS",
    vm: "1",
    name: "TherapyDescription"
  },
  "0018003A": {
    tag: "(0018,003A)",
    vr: "ST",
    vm: "1",
    name: "InterventionDescription"
  },
  "00180040": {
    tag: "(0018,0040)",
    vr: "IS",
    vm: "1",
    name: "CineRate"
  },
  "00180042": {
    tag: "(0018,0042)",
    vr: "CS",
    vm: "1",
    name: "InitialCineRunState"
  },
  "00180050": {
    tag: "(0018,0050)",
    vr: "DS",
    vm: "1",
    name: "SliceThickness"
  },
  "00180060": {
    tag: "(0018,0060)",
    vr: "DS",
    vm: "1",
    name: "KVP"
  },
  "00180061": {
    tag: "(0018,0061)",
    vr: "DS",
    vm: "1",
    name: ""
  },
  "00180070": {
    tag: "(0018,0070)",
    vr: "IS",
    vm: "1",
    name: "CountsAccumulated"
  },
  "00180071": {
    tag: "(0018,0071)",
    vr: "CS",
    vm: "1",
    name: "AcquisitionTerminationCondition"
  },
  "00180072": {
    tag: "(0018,0072)",
    vr: "DS",
    vm: "1",
    name: "EffectiveDuration"
  },
  "00180073": {
    tag: "(0018,0073)",
    vr: "CS",
    vm: "1",
    name: "AcquisitionStartCondition"
  },
  "00180074": {
    tag: "(0018,0074)",
    vr: "IS",
    vm: "1",
    name: "AcquisitionStartConditionData"
  },
  "00180075": {
    tag: "(0018,0075)",
    vr: "IS",
    vm: "1",
    name: "AcquisitionTerminationConditionData"
  },
  "00180080": {
    tag: "(0018,0080)",
    vr: "DS",
    vm: "1",
    name: "RepetitionTime"
  },
  "00180081": {
    tag: "(0018,0081)",
    vr: "DS",
    vm: "1",
    name: "EchoTime"
  },
  "00180082": {
    tag: "(0018,0082)",
    vr: "DS",
    vm: "1",
    name: "InversionTime"
  },
  "00180083": {
    tag: "(0018,0083)",
    vr: "DS",
    vm: "1",
    name: "NumberOfAverages"
  },
  "00180084": {
    tag: "(0018,0084)",
    vr: "DS",
    vm: "1",
    name: "ImagingFrequency"
  },
  "00180085": {
    tag: "(0018,0085)",
    vr: "SH",
    vm: "1",
    name: "ImagedNucleus"
  },
  "00180086": {
    tag: "(0018,0086)",
    vr: "IS",
    vm: "1-n",
    name: "EchoNumbers"
  },
  "00180087": {
    tag: "(0018,0087)",
    vr: "DS",
    vm: "1",
    name: "MagneticFieldStrength"
  },
  "00180088": {
    tag: "(0018,0088)",
    vr: "DS",
    vm: "1",
    name: "SpacingBetweenSlices"
  },
  "00180089": {
    tag: "(0018,0089)",
    vr: "IS",
    vm: "1",
    name: "NumberOfPhaseEncodingSteps"
  },
  "00180090": {
    tag: "(0018,0090)",
    vr: "DS",
    vm: "1",
    name: "DataCollectionDiameter"
  },
  "00180091": {
    tag: "(0018,0091)",
    vr: "IS",
    vm: "1",
    name: "EchoTrainLength"
  },
  "00180093": {
    tag: "(0018,0093)",
    vr: "DS",
    vm: "1",
    name: "PercentSampling"
  },
  "00180094": {
    tag: "(0018,0094)",
    vr: "DS",
    vm: "1",
    name: "PercentPhaseFieldOfView"
  },
  "00180095": {
    tag: "(0018,0095)",
    vr: "DS",
    vm: "1",
    name: "PixelBandwidth"
  },
  "00181000": {
    tag: "(0018,1000)",
    vr: "LO",
    vm: "1",
    name: "DeviceSerialNumber"
  },
  "00181002": {
    tag: "(0018,1002)",
    vr: "UI",
    vm: "1",
    name: "DeviceUID"
  },
  "00181003": {
    tag: "(0018,1003)",
    vr: "LO",
    vm: "1",
    name: "DeviceID"
  },
  "00181004": {
    tag: "(0018,1004)",
    vr: "LO",
    vm: "1",
    name: "PlateID"
  },
  "00181005": {
    tag: "(0018,1005)",
    vr: "LO",
    vm: "1",
    name: "GeneratorID"
  },
  "00181006": {
    tag: "(0018,1006)",
    vr: "LO",
    vm: "1",
    name: "GridID"
  },
  "00181007": {
    tag: "(0018,1007)",
    vr: "LO",
    vm: "1",
    name: "CassetteID"
  },
  "00181008": {
    tag: "(0018,1008)",
    vr: "LO",
    vm: "1",
    name: "GantryID"
  },
  "00181009": {
    tag: "(0018,1009)",
    vr: "UT",
    vm: "1",
    name: "UniqueDeviceIdentifier"
  },
  "0018100A": {
    tag: "(0018,100A)",
    vr: "SQ",
    vm: "1",
    name: "UDISequence"
  },
  "00181010": {
    tag: "(0018,1010)",
    vr: "LO",
    vm: "1",
    name: "SecondaryCaptureDeviceID"
  },
  "00181011": {
    tag: "(0018,1011)",
    vr: "LO",
    vm: "1",
    name: "HardcopyCreationDeviceID"
  },
  "00181012": {
    tag: "(0018,1012)",
    vr: "DA",
    vm: "1",
    name: "DateOfSecondaryCapture"
  },
  "00181014": {
    tag: "(0018,1014)",
    vr: "TM",
    vm: "1",
    name: "TimeOfSecondaryCapture"
  },
  "00181016": {
    tag: "(0018,1016)",
    vr: "LO",
    vm: "1",
    name: "SecondaryCaptureDeviceManufacturer"
  },
  "00181017": {
    tag: "(0018,1017)",
    vr: "LO",
    vm: "1",
    name: "HardcopyDeviceManufacturer"
  },
  "00181018": {
    tag: "(0018,1018)",
    vr: "LO",
    vm: "1",
    name: "SecondaryCaptureDeviceManufacturerModelName"
  },
  "00181019": {
    tag: "(0018,1019)",
    vr: "LO",
    vm: "1-n",
    name: "SecondaryCaptureDeviceSoftwareVersions"
  },
  "0018101A": {
    tag: "(0018,101A)",
    vr: "LO",
    vm: "1-n",
    name: "HardcopyDeviceSoftwareVersion"
  },
  "0018101B": {
    tag: "(0018,101B)",
    vr: "LO",
    vm: "1",
    name: "HardcopyDeviceManufacturerModelName"
  },
  "00181020": {
    tag: "(0018,1020)",
    vr: "LO",
    vm: "1-n",
    name: "SoftwareVersions"
  },
  "00181022": {
    tag: "(0018,1022)",
    vr: "SH",
    vm: "1",
    name: "VideoImageFormatAcquired"
  },
  "00181023": {
    tag: "(0018,1023)",
    vr: "LO",
    vm: "1",
    name: "DigitalImageFormatAcquired"
  },
  "00181030": {
    tag: "(0018,1030)",
    vr: "LO",
    vm: "1",
    name: "ProtocolName"
  },
  "00181040": {
    tag: "(0018,1040)",
    vr: "LO",
    vm: "1",
    name: "ContrastBolusRoute"
  },
  "00181041": {
    tag: "(0018,1041)",
    vr: "DS",
    vm: "1",
    name: "ContrastBolusVolume"
  },
  "00181042": {
    tag: "(0018,1042)",
    vr: "TM",
    vm: "1",
    name: "ContrastBolusStartTime"
  },
  "00181043": {
    tag: "(0018,1043)",
    vr: "TM",
    vm: "1",
    name: "ContrastBolusStopTime"
  },
  "00181044": {
    tag: "(0018,1044)",
    vr: "DS",
    vm: "1",
    name: "ContrastBolusTotalDose"
  },
  "00181045": {
    tag: "(0018,1045)",
    vr: "IS",
    vm: "1",
    name: "SyringeCounts"
  },
  "00181046": {
    tag: "(0018,1046)",
    vr: "DS",
    vm: "1-n",
    name: "ContrastFlowRate"
  },
  "00181047": {
    tag: "(0018,1047)",
    vr: "DS",
    vm: "1-n",
    name: "ContrastFlowDuration"
  },
  "00181048": {
    tag: "(0018,1048)",
    vr: "CS",
    vm: "1",
    name: "ContrastBolusIngredient"
  },
  "00181049": {
    tag: "(0018,1049)",
    vr: "DS",
    vm: "1",
    name: "ContrastBolusIngredientConcentration"
  },
  "00181050": {
    tag: "(0018,1050)",
    vr: "DS",
    vm: "1",
    name: "SpatialResolution"
  },
  "00181060": {
    tag: "(0018,1060)",
    vr: "DS",
    vm: "1",
    name: "TriggerTime"
  },
  "00181061": {
    tag: "(0018,1061)",
    vr: "LO",
    vm: "1",
    name: "TriggerSourceOrType"
  },
  "00181062": {
    tag: "(0018,1062)",
    vr: "IS",
    vm: "1",
    name: "NominalInterval"
  },
  "00181063": {
    tag: "(0018,1063)",
    vr: "DS",
    vm: "1",
    name: "FrameTime"
  },
  "00181064": {
    tag: "(0018,1064)",
    vr: "LO",
    vm: "1",
    name: "CardiacFramingType"
  },
  "00181065": {
    tag: "(0018,1065)",
    vr: "DS",
    vm: "1-n",
    name: "FrameTimeVector"
  },
  "00181066": {
    tag: "(0018,1066)",
    vr: "DS",
    vm: "1",
    name: "FrameDelay"
  },
  "00181067": {
    tag: "(0018,1067)",
    vr: "DS",
    vm: "1",
    name: "ImageTriggerDelay"
  },
  "00181068": {
    tag: "(0018,1068)",
    vr: "DS",
    vm: "1",
    name: "MultiplexGroupTimeOffset"
  },
  "00181069": {
    tag: "(0018,1069)",
    vr: "DS",
    vm: "1",
    name: "TriggerTimeOffset"
  },
  "0018106A": {
    tag: "(0018,106A)",
    vr: "CS",
    vm: "1",
    name: "SynchronizationTrigger"
  },
  "0018106C": {
    tag: "(0018,106C)",
    vr: "US",
    vm: "2",
    name: "SynchronizationChannel"
  },
  "0018106E": {
    tag: "(0018,106E)",
    vr: "UL",
    vm: "1",
    name: "TriggerSamplePosition"
  },
  "00181070": {
    tag: "(0018,1070)",
    vr: "LO",
    vm: "1",
    name: "RadiopharmaceuticalRoute"
  },
  "00181071": {
    tag: "(0018,1071)",
    vr: "DS",
    vm: "1",
    name: "RadiopharmaceuticalVolume"
  },
  "00181072": {
    tag: "(0018,1072)",
    vr: "TM",
    vm: "1",
    name: "RadiopharmaceuticalStartTime"
  },
  "00181073": {
    tag: "(0018,1073)",
    vr: "TM",
    vm: "1",
    name: "RadiopharmaceuticalStopTime"
  },
  "00181074": {
    tag: "(0018,1074)",
    vr: "DS",
    vm: "1",
    name: "RadionuclideTotalDose"
  },
  "00181075": {
    tag: "(0018,1075)",
    vr: "DS",
    vm: "1",
    name: "RadionuclideHalfLife"
  },
  "00181076": {
    tag: "(0018,1076)",
    vr: "DS",
    vm: "1",
    name: "RadionuclidePositronFraction"
  },
  "00181077": {
    tag: "(0018,1077)",
    vr: "DS",
    vm: "1",
    name: "RadiopharmaceuticalSpecificActivity"
  },
  "00181078": {
    tag: "(0018,1078)",
    vr: "DT",
    vm: "1",
    name: "RadiopharmaceuticalStartDateTime"
  },
  "00181079": {
    tag: "(0018,1079)",
    vr: "DT",
    vm: "1",
    name: "RadiopharmaceuticalStopDateTime"
  },
  "00181080": {
    tag: "(0018,1080)",
    vr: "CS",
    vm: "1",
    name: "BeatRejectionFlag"
  },
  "00181081": {
    tag: "(0018,1081)",
    vr: "IS",
    vm: "1",
    name: "LowRRValue"
  },
  "00181082": {
    tag: "(0018,1082)",
    vr: "IS",
    vm: "1",
    name: "HighRRValue"
  },
  "00181083": {
    tag: "(0018,1083)",
    vr: "IS",
    vm: "1",
    name: "IntervalsAcquired"
  },
  "00181084": {
    tag: "(0018,1084)",
    vr: "IS",
    vm: "1",
    name: "IntervalsRejected"
  },
  "00181085": {
    tag: "(0018,1085)",
    vr: "LO",
    vm: "1",
    name: "PVCRejection"
  },
  "00181086": {
    tag: "(0018,1086)",
    vr: "IS",
    vm: "1",
    name: "SkipBeats"
  },
  "00181088": {
    tag: "(0018,1088)",
    vr: "IS",
    vm: "1",
    name: "HeartRate"
  },
  "00181090": {
    tag: "(0018,1090)",
    vr: "IS",
    vm: "1",
    name: "CardiacNumberOfImages"
  },
  "00181094": {
    tag: "(0018,1094)",
    vr: "IS",
    vm: "1",
    name: "TriggerWindow"
  },
  "00181100": {
    tag: "(0018,1100)",
    vr: "DS",
    vm: "1",
    name: "ReconstructionDiameter"
  },
  "00181110": {
    tag: "(0018,1110)",
    vr: "DS",
    vm: "1",
    name: "DistanceSourceToDetector"
  },
  "00181111": {
    tag: "(0018,1111)",
    vr: "DS",
    vm: "1",
    name: "DistanceSourceToPatient"
  },
  "00181114": {
    tag: "(0018,1114)",
    vr: "DS",
    vm: "1",
    name: "EstimatedRadiographicMagnificationFactor"
  },
  "00181120": {
    tag: "(0018,1120)",
    vr: "DS",
    vm: "1",
    name: "GantryDetectorTilt"
  },
  "00181121": {
    tag: "(0018,1121)",
    vr: "DS",
    vm: "1",
    name: "GantryDetectorSlew"
  },
  "00181130": {
    tag: "(0018,1130)",
    vr: "DS",
    vm: "1",
    name: "TableHeight"
  },
  "00181131": {
    tag: "(0018,1131)",
    vr: "DS",
    vm: "1",
    name: "TableTraverse"
  },
  "00181134": {
    tag: "(0018,1134)",
    vr: "CS",
    vm: "1",
    name: "TableMotion"
  },
  "00181135": {
    tag: "(0018,1135)",
    vr: "DS",
    vm: "1-n",
    name: "TableVerticalIncrement"
  },
  "00181136": {
    tag: "(0018,1136)",
    vr: "DS",
    vm: "1-n",
    name: "TableLateralIncrement"
  },
  "00181137": {
    tag: "(0018,1137)",
    vr: "DS",
    vm: "1-n",
    name: "TableLongitudinalIncrement"
  },
  "00181138": {
    tag: "(0018,1138)",
    vr: "DS",
    vm: "1",
    name: "TableAngle"
  },
  "0018113A": {
    tag: "(0018,113A)",
    vr: "CS",
    vm: "1",
    name: "TableType"
  },
  "00181140": {
    tag: "(0018,1140)",
    vr: "CS",
    vm: "1",
    name: "RotationDirection"
  },
  "00181141": {
    tag: "(0018,1141)",
    vr: "DS",
    vm: "1",
    name: "AngularPosition"
  },
  "00181142": {
    tag: "(0018,1142)",
    vr: "DS",
    vm: "1-n",
    name: "RadialPosition"
  },
  "00181143": {
    tag: "(0018,1143)",
    vr: "DS",
    vm: "1",
    name: "ScanArc"
  },
  "00181144": {
    tag: "(0018,1144)",
    vr: "DS",
    vm: "1",
    name: "AngularStep"
  },
  "00181145": {
    tag: "(0018,1145)",
    vr: "DS",
    vm: "1",
    name: "CenterOfRotationOffset"
  },
  "00181146": {
    tag: "(0018,1146)",
    vr: "DS",
    vm: "1-n",
    name: "RotationOffset"
  },
  "00181147": {
    tag: "(0018,1147)",
    vr: "CS",
    vm: "1",
    name: "FieldOfViewShape"
  },
  "00181149": {
    tag: "(0018,1149)",
    vr: "IS",
    vm: "1-2",
    name: "FieldOfViewDimensions"
  },
  "00181150": {
    tag: "(0018,1150)",
    vr: "IS",
    vm: "1",
    name: "ExposureTime"
  },
  "00181151": {
    tag: "(0018,1151)",
    vr: "IS",
    vm: "1",
    name: "XRayTubeCurrent"
  },
  "00181152": {
    tag: "(0018,1152)",
    vr: "IS",
    vm: "1",
    name: "Exposure"
  },
  "00181153": {
    tag: "(0018,1153)",
    vr: "IS",
    vm: "1",
    name: "ExposureInuAs"
  },
  "00181154": {
    tag: "(0018,1154)",
    vr: "DS",
    vm: "1",
    name: "AveragePulseWidth"
  },
  "00181155": {
    tag: "(0018,1155)",
    vr: "CS",
    vm: "1",
    name: "RadiationSetting"
  },
  "00181156": {
    tag: "(0018,1156)",
    vr: "CS",
    vm: "1",
    name: "RectificationType"
  },
  "0018115A": {
    tag: "(0018,115A)",
    vr: "CS",
    vm: "1",
    name: "RadiationMode"
  },
  "0018115E": {
    tag: "(0018,115E)",
    vr: "DS",
    vm: "1",
    name: "ImageAndFluoroscopyAreaDoseProduct"
  },
  "00181160": {
    tag: "(0018,1160)",
    vr: "SH",
    vm: "1",
    name: "FilterType"
  },
  "00181161": {
    tag: "(0018,1161)",
    vr: "LO",
    vm: "1-n",
    name: "TypeOfFilters"
  },
  "00181162": {
    tag: "(0018,1162)",
    vr: "DS",
    vm: "1",
    name: "IntensifierSize"
  },
  "00181164": {
    tag: "(0018,1164)",
    vr: "DS",
    vm: "2",
    name: "ImagerPixelSpacing"
  },
  "00181166": {
    tag: "(0018,1166)",
    vr: "CS",
    vm: "1-n",
    name: "Grid"
  },
  "00181170": {
    tag: "(0018,1170)",
    vr: "IS",
    vm: "1",
    name: "GeneratorPower"
  },
  "00181180": {
    tag: "(0018,1180)",
    vr: "SH",
    vm: "1",
    name: "CollimatorGridName"
  },
  "00181181": {
    tag: "(0018,1181)",
    vr: "CS",
    vm: "1",
    name: "CollimatorType"
  },
  "00181182": {
    tag: "(0018,1182)",
    vr: "IS",
    vm: "1-2",
    name: "FocalDistance"
  },
  "00181183": {
    tag: "(0018,1183)",
    vr: "DS",
    vm: "1-2",
    name: "XFocusCenter"
  },
  "00181184": {
    tag: "(0018,1184)",
    vr: "DS",
    vm: "1-2",
    name: "YFocusCenter"
  },
  "00181190": {
    tag: "(0018,1190)",
    vr: "DS",
    vm: "1-n",
    name: "FocalSpots"
  },
  "00181191": {
    tag: "(0018,1191)",
    vr: "CS",
    vm: "1",
    name: "AnodeTargetMaterial"
  },
  "001811A0": {
    tag: "(0018,11A0)",
    vr: "DS",
    vm: "1",
    name: "BodyPartThickness"
  },
  "001811A2": {
    tag: "(0018,11A2)",
    vr: "DS",
    vm: "1",
    name: "CompressionForce"
  },
  "001811A3": {
    tag: "(0018,11A3)",
    vr: "DS",
    vm: "1",
    name: "CompressionPressure"
  },
  "001811A4": {
    tag: "(0018,11A4)",
    vr: "LO",
    vm: "1",
    name: "PaddleDescription"
  },
  "001811A5": {
    tag: "(0018,11A5)",
    vr: "DS",
    vm: "1",
    name: "CompressionContactArea"
  },
  "00181200": {
    tag: "(0018,1200)",
    vr: "DA",
    vm: "1-n",
    name: "DateOfLastCalibration"
  },
  "00181201": {
    tag: "(0018,1201)",
    vr: "TM",
    vm: "1-n",
    name: "TimeOfLastCalibration"
  },
  "00181202": {
    tag: "(0018,1202)",
    vr: "DT",
    vm: "1",
    name: "DateTimeOfLastCalibration"
  },
  "00181210": {
    tag: "(0018,1210)",
    vr: "SH",
    vm: "1-n",
    name: "ConvolutionKernel"
  },
  "00181240": {
    tag: "(0018,1240)",
    vr: "IS",
    vm: "1-n",
    name: "UpperLowerPixelValues"
  },
  "00181242": {
    tag: "(0018,1242)",
    vr: "IS",
    vm: "1",
    name: "ActualFrameDuration"
  },
  "00181243": {
    tag: "(0018,1243)",
    vr: "IS",
    vm: "1",
    name: "CountRate"
  },
  "00181244": {
    tag: "(0018,1244)",
    vr: "US",
    vm: "1",
    name: "PreferredPlaybackSequencing"
  },
  "00181250": {
    tag: "(0018,1250)",
    vr: "SH",
    vm: "1",
    name: "ReceiveCoilName"
  },
  "00181251": {
    tag: "(0018,1251)",
    vr: "SH",
    vm: "1",
    name: "TransmitCoilName"
  },
  "00181260": {
    tag: "(0018,1260)",
    vr: "SH",
    vm: "1",
    name: "PlateType"
  },
  "00181261": {
    tag: "(0018,1261)",
    vr: "LO",
    vm: "1",
    name: "PhosphorType"
  },
  "00181271": {
    tag: "(0018,1271)",
    vr: "FD",
    vm: "1",
    name: "WaterEquivalentDiameter"
  },
  "00181272": {
    tag: "(0018,1272)",
    vr: "SQ",
    vm: "1",
    name: "WaterEquivalentDiameterCalculationMethodCodeSequence"
  },
  "00181300": {
    tag: "(0018,1300)",
    vr: "DS",
    vm: "1",
    name: "ScanVelocity"
  },
  "00181301": {
    tag: "(0018,1301)",
    vr: "CS",
    vm: "1-n",
    name: "WholeBodyTechnique"
  },
  "00181302": {
    tag: "(0018,1302)",
    vr: "IS",
    vm: "1",
    name: "ScanLength"
  },
  "00181310": {
    tag: "(0018,1310)",
    vr: "US",
    vm: "4",
    name: "AcquisitionMatrix"
  },
  "00181312": {
    tag: "(0018,1312)",
    vr: "CS",
    vm: "1",
    name: "InPlanePhaseEncodingDirection"
  },
  "00181314": {
    tag: "(0018,1314)",
    vr: "DS",
    vm: "1",
    name: "FlipAngle"
  },
  "00181315": {
    tag: "(0018,1315)",
    vr: "CS",
    vm: "1",
    name: "VariableFlipAngleFlag"
  },
  "00181316": {
    tag: "(0018,1316)",
    vr: "DS",
    vm: "1",
    name: "SAR"
  },
  "00181318": {
    tag: "(0018,1318)",
    vr: "DS",
    vm: "1",
    name: "dBdt"
  },
  "00181320": {
    tag: "(0018,1320)",
    vr: "FL",
    vm: "1",
    name: "B1rms"
  },
  "00181400": {
    tag: "(0018,1400)",
    vr: "LO",
    vm: "1",
    name: "AcquisitionDeviceProcessingDescription"
  },
  "00181401": {
    tag: "(0018,1401)",
    vr: "LO",
    vm: "1",
    name: "AcquisitionDeviceProcessingCode"
  },
  "00181402": {
    tag: "(0018,1402)",
    vr: "CS",
    vm: "1",
    name: "CassetteOrientation"
  },
  "00181403": {
    tag: "(0018,1403)",
    vr: "CS",
    vm: "1",
    name: "CassetteSize"
  },
  "00181404": {
    tag: "(0018,1404)",
    vr: "US",
    vm: "1",
    name: "ExposuresOnPlate"
  },
  "00181405": {
    tag: "(0018,1405)",
    vr: "IS",
    vm: "1",
    name: "RelativeXRayExposure"
  },
  "00181411": {
    tag: "(0018,1411)",
    vr: "DS",
    vm: "1",
    name: "ExposureIndex"
  },
  "00181412": {
    tag: "(0018,1412)",
    vr: "DS",
    vm: "1",
    name: "TargetExposureIndex"
  },
  "00181413": {
    tag: "(0018,1413)",
    vr: "DS",
    vm: "1",
    name: "DeviationIndex"
  },
  "00181450": {
    tag: "(0018,1450)",
    vr: "DS",
    vm: "1",
    name: "ColumnAngulation"
  },
  "00181460": {
    tag: "(0018,1460)",
    vr: "DS",
    vm: "1",
    name: "TomoLayerHeight"
  },
  "00181470": {
    tag: "(0018,1470)",
    vr: "DS",
    vm: "1",
    name: "TomoAngle"
  },
  "00181480": {
    tag: "(0018,1480)",
    vr: "DS",
    vm: "1",
    name: "TomoTime"
  },
  "00181490": {
    tag: "(0018,1490)",
    vr: "CS",
    vm: "1",
    name: "TomoType"
  },
  "00181491": {
    tag: "(0018,1491)",
    vr: "CS",
    vm: "1",
    name: "TomoClass"
  },
  "00181495": {
    tag: "(0018,1495)",
    vr: "IS",
    vm: "1",
    name: "NumberOfTomosynthesisSourceImages"
  },
  "00181500": {
    tag: "(0018,1500)",
    vr: "CS",
    vm: "1",
    name: "PositionerMotion"
  },
  "00181508": {
    tag: "(0018,1508)",
    vr: "CS",
    vm: "1",
    name: "PositionerType"
  },
  "00181510": {
    tag: "(0018,1510)",
    vr: "DS",
    vm: "1",
    name: "PositionerPrimaryAngle"
  },
  "00181511": {
    tag: "(0018,1511)",
    vr: "DS",
    vm: "1",
    name: "PositionerSecondaryAngle"
  },
  "00181520": {
    tag: "(0018,1520)",
    vr: "DS",
    vm: "1-n",
    name: "PositionerPrimaryAngleIncrement"
  },
  "00181521": {
    tag: "(0018,1521)",
    vr: "DS",
    vm: "1-n",
    name: "PositionerSecondaryAngleIncrement"
  },
  "00181530": {
    tag: "(0018,1530)",
    vr: "DS",
    vm: "1",
    name: "DetectorPrimaryAngle"
  },
  "00181531": {
    tag: "(0018,1531)",
    vr: "DS",
    vm: "1",
    name: "DetectorSecondaryAngle"
  },
  "00181600": {
    tag: "(0018,1600)",
    vr: "CS",
    vm: "1-3",
    name: "ShutterShape"
  },
  "00181602": {
    tag: "(0018,1602)",
    vr: "IS",
    vm: "1",
    name: "ShutterLeftVerticalEdge"
  },
  "00181604": {
    tag: "(0018,1604)",
    vr: "IS",
    vm: "1",
    name: "ShutterRightVerticalEdge"
  },
  "00181606": {
    tag: "(0018,1606)",
    vr: "IS",
    vm: "1",
    name: "ShutterUpperHorizontalEdge"
  },
  "00181608": {
    tag: "(0018,1608)",
    vr: "IS",
    vm: "1",
    name: "ShutterLowerHorizontalEdge"
  },
  "00181610": {
    tag: "(0018,1610)",
    vr: "IS",
    vm: "2",
    name: "CenterOfCircularShutter"
  },
  "00181612": {
    tag: "(0018,1612)",
    vr: "IS",
    vm: "1",
    name: "RadiusOfCircularShutter"
  },
  "00181620": {
    tag: "(0018,1620)",
    vr: "IS",
    vm: "2-2n",
    name: "VerticesOfThePolygonalShutter"
  },
  "00181622": {
    tag: "(0018,1622)",
    vr: "US",
    vm: "1",
    name: "ShutterPresentationValue"
  },
  "00181623": {
    tag: "(0018,1623)",
    vr: "US",
    vm: "1",
    name: "ShutterOverlayGroup"
  },
  "00181624": {
    tag: "(0018,1624)",
    vr: "US",
    vm: "3",
    name: "ShutterPresentationColorCIELabValue"
  },
  "00181700": {
    tag: "(0018,1700)",
    vr: "CS",
    vm: "1-3",
    name: "CollimatorShape"
  },
  "00181702": {
    tag: "(0018,1702)",
    vr: "IS",
    vm: "1",
    name: "CollimatorLeftVerticalEdge"
  },
  "00181704": {
    tag: "(0018,1704)",
    vr: "IS",
    vm: "1",
    name: "CollimatorRightVerticalEdge"
  },
  "00181706": {
    tag: "(0018,1706)",
    vr: "IS",
    vm: "1",
    name: "CollimatorUpperHorizontalEdge"
  },
  "00181708": {
    tag: "(0018,1708)",
    vr: "IS",
    vm: "1",
    name: "CollimatorLowerHorizontalEdge"
  },
  "00181710": {
    tag: "(0018,1710)",
    vr: "IS",
    vm: "2",
    name: "CenterOfCircularCollimator"
  },
  "00181712": {
    tag: "(0018,1712)",
    vr: "IS",
    vm: "1",
    name: "RadiusOfCircularCollimator"
  },
  "00181720": {
    tag: "(0018,1720)",
    vr: "IS",
    vm: "2-2n",
    name: "VerticesOfThePolygonalCollimator"
  },
  "00181800": {
    tag: "(0018,1800)",
    vr: "CS",
    vm: "1",
    name: "AcquisitionTimeSynchronized"
  },
  "00181801": {
    tag: "(0018,1801)",
    vr: "SH",
    vm: "1",
    name: "TimeSource"
  },
  "00181802": {
    tag: "(0018,1802)",
    vr: "CS",
    vm: "1",
    name: "TimeDistributionProtocol"
  },
  "00181803": {
    tag: "(0018,1803)",
    vr: "LO",
    vm: "1",
    name: "NTPSourceAddress"
  },
  "00182001": {
    tag: "(0018,2001)",
    vr: "IS",
    vm: "1-n",
    name: "PageNumberVector"
  },
  "00182002": {
    tag: "(0018,2002)",
    vr: "SH",
    vm: "1-n",
    name: "FrameLabelVector"
  },
  "00182003": {
    tag: "(0018,2003)",
    vr: "DS",
    vm: "1-n",
    name: "FramePrimaryAngleVector"
  },
  "00182004": {
    tag: "(0018,2004)",
    vr: "DS",
    vm: "1-n",
    name: "FrameSecondaryAngleVector"
  },
  "00182005": {
    tag: "(0018,2005)",
    vr: "DS",
    vm: "1-n",
    name: "SliceLocationVector"
  },
  "00182006": {
    tag: "(0018,2006)",
    vr: "SH",
    vm: "1-n",
    name: "DisplayWindowLabelVector"
  },
  "00182010": {
    tag: "(0018,2010)",
    vr: "DS",
    vm: "2",
    name: "NominalScannedPixelSpacing"
  },
  "00182020": {
    tag: "(0018,2020)",
    vr: "CS",
    vm: "1",
    name: "DigitizingDeviceTransportDirection"
  },
  "00182030": {
    tag: "(0018,2030)",
    vr: "DS",
    vm: "1",
    name: "RotationOfScannedFilm"
  },
  "00182041": {
    tag: "(0018,2041)",
    vr: "SQ",
    vm: "1",
    name: "BiopsyTargetSequence"
  },
  "00182042": {
    tag: "(0018,2042)",
    vr: "UI",
    vm: "1",
    name: "TargetUID"
  },
  "00182043": {
    tag: "(0018,2043)",
    vr: "FL",
    vm: "2",
    name: "LocalizingCursorPosition"
  },
  "00182044": {
    tag: "(0018,2044)",
    vr: "FL",
    vm: "3",
    name: "CalculatedTargetPosition"
  },
  "00182045": {
    tag: "(0018,2045)",
    vr: "SH",
    vm: "1",
    name: "TargetLabel"
  },
  "00182046": {
    tag: "(0018,2046)",
    vr: "FL",
    vm: "1",
    name: "DisplayedZValue"
  },
  "00183100": {
    tag: "(0018,3100)",
    vr: "CS",
    vm: "1",
    name: "IVUSAcquisition"
  },
  "00183101": {
    tag: "(0018,3101)",
    vr: "DS",
    vm: "1",
    name: "IVUSPullbackRate"
  },
  "00183102": {
    tag: "(0018,3102)",
    vr: "DS",
    vm: "1",
    name: "IVUSGatedRate"
  },
  "00183103": {
    tag: "(0018,3103)",
    vr: "IS",
    vm: "1",
    name: "IVUSPullbackStartFrameNumber"
  },
  "00183104": {
    tag: "(0018,3104)",
    vr: "IS",
    vm: "1",
    name: "IVUSPullbackStopFrameNumber"
  },
  "00183105": {
    tag: "(0018,3105)",
    vr: "IS",
    vm: "1-n",
    name: "LesionNumber"
  },
  "00184000": {
    tag: "(0018,4000)",
    vr: "LT",
    vm: "1",
    name: "AcquisitionComments"
  },
  "00185000": {
    tag: "(0018,5000)",
    vr: "SH",
    vm: "1-n",
    name: "OutputPower"
  },
  "00185010": {
    tag: "(0018,5010)",
    vr: "LO",
    vm: "1-n",
    name: "TransducerData"
  },
  "00185012": {
    tag: "(0018,5012)",
    vr: "DS",
    vm: "1",
    name: "FocusDepth"
  },
  "00185020": {
    tag: "(0018,5020)",
    vr: "LO",
    vm: "1",
    name: "ProcessingFunction"
  },
  "00185021": {
    tag: "(0018,5021)",
    vr: "LO",
    vm: "1",
    name: "PostprocessingFunction"
  },
  "00185022": {
    tag: "(0018,5022)",
    vr: "DS",
    vm: "1",
    name: "MechanicalIndex"
  },
  "00185024": {
    tag: "(0018,5024)",
    vr: "DS",
    vm: "1",
    name: "BoneThermalIndex"
  },
  "00185026": {
    tag: "(0018,5026)",
    vr: "DS",
    vm: "1",
    name: "CranialThermalIndex"
  },
  "00185027": {
    tag: "(0018,5027)",
    vr: "DS",
    vm: "1",
    name: "SoftTissueThermalIndex"
  },
  "00185028": {
    tag: "(0018,5028)",
    vr: "DS",
    vm: "1",
    name: "SoftTissueFocusThermalIndex"
  },
  "00185029": {
    tag: "(0018,5029)",
    vr: "DS",
    vm: "1",
    name: "SoftTissueSurfaceThermalIndex"
  },
  "00185030": {
    tag: "(0018,5030)",
    vr: "DS",
    vm: "1",
    name: "DynamicRange"
  },
  "00185040": {
    tag: "(0018,5040)",
    vr: "DS",
    vm: "1",
    name: "TotalGain"
  },
  "00185050": {
    tag: "(0018,5050)",
    vr: "IS",
    vm: "1",
    name: "DepthOfScanField"
  },
  "00185100": {
    tag: "(0018,5100)",
    vr: "CS",
    vm: "1",
    name: "PatientPosition"
  },
  "00185101": {
    tag: "(0018,5101)",
    vr: "CS",
    vm: "1",
    name: "ViewPosition"
  },
  "00185104": {
    tag: "(0018,5104)",
    vr: "SQ",
    vm: "1",
    name: "ProjectionEponymousNameCodeSequence"
  },
  "00185210": {
    tag: "(0018,5210)",
    vr: "DS",
    vm: "6",
    name: "ImageTransformationMatrix"
  },
  "00185212": {
    tag: "(0018,5212)",
    vr: "DS",
    vm: "3",
    name: "ImageTranslationVector"
  },
  "00186000": {
    tag: "(0018,6000)",
    vr: "DS",
    vm: "1",
    name: "Sensitivity"
  },
  "00186011": {
    tag: "(0018,6011)",
    vr: "SQ",
    vm: "1",
    name: "SequenceOfUltrasoundRegions"
  },
  "00186012": {
    tag: "(0018,6012)",
    vr: "US",
    vm: "1",
    name: "RegionSpatialFormat"
  },
  "00186014": {
    tag: "(0018,6014)",
    vr: "US",
    vm: "1",
    name: "RegionDataType"
  },
  "00186016": {
    tag: "(0018,6016)",
    vr: "UL",
    vm: "1",
    name: "RegionFlags"
  },
  "00186018": {
    tag: "(0018,6018)",
    vr: "UL",
    vm: "1",
    name: "RegionLocationMinX0"
  },
  "0018601A": {
    tag: "(0018,601A)",
    vr: "UL",
    vm: "1",
    name: "RegionLocationMinY0"
  },
  "0018601C": {
    tag: "(0018,601C)",
    vr: "UL",
    vm: "1",
    name: "RegionLocationMaxX1"
  },
  "0018601E": {
    tag: "(0018,601E)",
    vr: "UL",
    vm: "1",
    name: "RegionLocationMaxY1"
  },
  "00186020": {
    tag: "(0018,6020)",
    vr: "SL",
    vm: "1",
    name: "ReferencePixelX0"
  },
  "00186022": {
    tag: "(0018,6022)",
    vr: "SL",
    vm: "1",
    name: "ReferencePixelY0"
  },
  "00186024": {
    tag: "(0018,6024)",
    vr: "US",
    vm: "1",
    name: "PhysicalUnitsXDirection"
  },
  "00186026": {
    tag: "(0018,6026)",
    vr: "US",
    vm: "1",
    name: "PhysicalUnitsYDirection"
  },
  "00186028": {
    tag: "(0018,6028)",
    vr: "FD",
    vm: "1",
    name: "ReferencePixelPhysicalValueX"
  },
  "0018602A": {
    tag: "(0018,602A)",
    vr: "FD",
    vm: "1",
    name: "ReferencePixelPhysicalValueY"
  },
  "0018602C": {
    tag: "(0018,602C)",
    vr: "FD",
    vm: "1",
    name: "PhysicalDeltaX"
  },
  "0018602E": {
    tag: "(0018,602E)",
    vr: "FD",
    vm: "1",
    name: "PhysicalDeltaY"
  },
  "00186030": {
    tag: "(0018,6030)",
    vr: "UL",
    vm: "1",
    name: "TransducerFrequency"
  },
  "00186031": {
    tag: "(0018,6031)",
    vr: "CS",
    vm: "1",
    name: "TransducerType"
  },
  "00186032": {
    tag: "(0018,6032)",
    vr: "UL",
    vm: "1",
    name: "PulseRepetitionFrequency"
  },
  "00186034": {
    tag: "(0018,6034)",
    vr: "FD",
    vm: "1",
    name: "DopplerCorrectionAngle"
  },
  "00186036": {
    tag: "(0018,6036)",
    vr: "FD",
    vm: "1",
    name: "SteeringAngle"
  },
  "00186038": {
    tag: "(0018,6038)",
    vr: "UL",
    vm: "1",
    name: "DopplerSampleVolumeXPositionRetired"
  },
  "00186039": {
    tag: "(0018,6039)",
    vr: "SL",
    vm: "1",
    name: "DopplerSampleVolumeXPosition"
  },
  "0018603A": {
    tag: "(0018,603A)",
    vr: "UL",
    vm: "1",
    name: "DopplerSampleVolumeYPositionRetired"
  },
  "0018603B": {
    tag: "(0018,603B)",
    vr: "SL",
    vm: "1",
    name: "DopplerSampleVolumeYPosition"
  },
  "0018603C": {
    tag: "(0018,603C)",
    vr: "UL",
    vm: "1",
    name: "TMLinePositionX0Retired"
  },
  "0018603D": {
    tag: "(0018,603D)",
    vr: "SL",
    vm: "1",
    name: "TMLinePositionX0"
  },
  "0018603E": {
    tag: "(0018,603E)",
    vr: "UL",
    vm: "1",
    name: "TMLinePositionY0Retired"
  },
  "0018603F": {
    tag: "(0018,603F)",
    vr: "SL",
    vm: "1",
    name: "TMLinePositionY0"
  },
  "00186040": {
    tag: "(0018,6040)",
    vr: "UL",
    vm: "1",
    name: "TMLinePositionX1Retired"
  },
  "00186041": {
    tag: "(0018,6041)",
    vr: "SL",
    vm: "1",
    name: "TMLinePositionX1"
  },
  "00186042": {
    tag: "(0018,6042)",
    vr: "UL",
    vm: "1",
    name: "TMLinePositionY1Retired"
  },
  "00186043": {
    tag: "(0018,6043)",
    vr: "SL",
    vm: "1",
    name: "TMLinePositionY1"
  },
  "00186044": {
    tag: "(0018,6044)",
    vr: "US",
    vm: "1",
    name: "PixelComponentOrganization"
  },
  "00186046": {
    tag: "(0018,6046)",
    vr: "UL",
    vm: "1",
    name: "PixelComponentMask"
  },
  "00186048": {
    tag: "(0018,6048)",
    vr: "UL",
    vm: "1",
    name: "PixelComponentRangeStart"
  },
  "0018604A": {
    tag: "(0018,604A)",
    vr: "UL",
    vm: "1",
    name: "PixelComponentRangeStop"
  },
  "0018604C": {
    tag: "(0018,604C)",
    vr: "US",
    vm: "1",
    name: "PixelComponentPhysicalUnits"
  },
  "0018604E": {
    tag: "(0018,604E)",
    vr: "US",
    vm: "1",
    name: "PixelComponentDataType"
  },
  "00186050": {
    tag: "(0018,6050)",
    vr: "UL",
    vm: "1",
    name: "NumberOfTableBreakPoints"
  },
  "00186052": {
    tag: "(0018,6052)",
    vr: "UL",
    vm: "1-n",
    name: "TableOfXBreakPoints"
  },
  "00186054": {
    tag: "(0018,6054)",
    vr: "FD",
    vm: "1-n",
    name: "TableOfYBreakPoints"
  },
  "00186056": {
    tag: "(0018,6056)",
    vr: "UL",
    vm: "1",
    name: "NumberOfTableEntries"
  },
  "00186058": {
    tag: "(0018,6058)",
    vr: "UL",
    vm: "1-n",
    name: "TableOfPixelValues"
  },
  "0018605A": {
    tag: "(0018,605A)",
    vr: "FL",
    vm: "1-n",
    name: "TableOfParameterValues"
  },
  "00186060": {
    tag: "(0018,6060)",
    vr: "FL",
    vm: "1-n",
    name: "RWaveTimeVector"
  },
  "00187000": {
    tag: "(0018,7000)",
    vr: "CS",
    vm: "1",
    name: "DetectorConditionsNominalFlag"
  },
  "00187001": {
    tag: "(0018,7001)",
    vr: "DS",
    vm: "1",
    name: "DetectorTemperature"
  },
  "00187004": {
    tag: "(0018,7004)",
    vr: "CS",
    vm: "1",
    name: "DetectorType"
  },
  "00187005": {
    tag: "(0018,7005)",
    vr: "CS",
    vm: "1",
    name: "DetectorConfiguration"
  },
  "00187006": {
    tag: "(0018,7006)",
    vr: "LT",
    vm: "1",
    name: "DetectorDescription"
  },
  "00187008": {
    tag: "(0018,7008)",
    vr: "LT",
    vm: "1",
    name: "DetectorMode"
  },
  "0018700A": {
    tag: "(0018,700A)",
    vr: "SH",
    vm: "1",
    name: "DetectorID"
  },
  "0018700C": {
    tag: "(0018,700C)",
    vr: "DA",
    vm: "1",
    name: "DateOfLastDetectorCalibration"
  },
  "0018700E": {
    tag: "(0018,700E)",
    vr: "TM",
    vm: "1",
    name: "TimeOfLastDetectorCalibration"
  },
  "00187010": {
    tag: "(0018,7010)",
    vr: "IS",
    vm: "1",
    name: "ExposuresOnDetectorSinceLastCalibration"
  },
  "00187011": {
    tag: "(0018,7011)",
    vr: "IS",
    vm: "1",
    name: "ExposuresOnDetectorSinceManufactured"
  },
  "00187012": {
    tag: "(0018,7012)",
    vr: "DS",
    vm: "1",
    name: "DetectorTimeSinceLastExposure"
  },
  "00187014": {
    tag: "(0018,7014)",
    vr: "DS",
    vm: "1",
    name: "DetectorActiveTime"
  },
  "00187016": {
    tag: "(0018,7016)",
    vr: "DS",
    vm: "1",
    name: "DetectorActivationOffsetFromExposure"
  },
  "0018701A": {
    tag: "(0018,701A)",
    vr: "DS",
    vm: "2",
    name: "DetectorBinning"
  },
  "00187020": {
    tag: "(0018,7020)",
    vr: "DS",
    vm: "2",
    name: "DetectorElementPhysicalSize"
  },
  "00187022": {
    tag: "(0018,7022)",
    vr: "DS",
    vm: "2",
    name: "DetectorElementSpacing"
  },
  "00187024": {
    tag: "(0018,7024)",
    vr: "CS",
    vm: "1",
    name: "DetectorActiveShape"
  },
  "00187026": {
    tag: "(0018,7026)",
    vr: "DS",
    vm: "1-2",
    name: "DetectorActiveDimensions"
  },
  "00187028": {
    tag: "(0018,7028)",
    vr: "DS",
    vm: "2",
    name: "DetectorActiveOrigin"
  },
  "0018702A": {
    tag: "(0018,702A)",
    vr: "LO",
    vm: "1",
    name: "DetectorManufacturerName"
  },
  "0018702B": {
    tag: "(0018,702B)",
    vr: "LO",
    vm: "1",
    name: "DetectorManufacturerModelName"
  },
  "00187030": {
    tag: "(0018,7030)",
    vr: "DS",
    vm: "2",
    name: "FieldOfViewOrigin"
  },
  "00187032": {
    tag: "(0018,7032)",
    vr: "DS",
    vm: "1",
    name: "FieldOfViewRotation"
  },
  "00187034": {
    tag: "(0018,7034)",
    vr: "CS",
    vm: "1",
    name: "FieldOfViewHorizontalFlip"
  },
  "00187036": {
    tag: "(0018,7036)",
    vr: "FL",
    vm: "2",
    name: "PixelDataAreaOriginRelativeToFOV"
  },
  "00187038": {
    tag: "(0018,7038)",
    vr: "FL",
    vm: "1",
    name: "PixelDataAreaRotationAngleRelativeToFOV"
  },
  "00187040": {
    tag: "(0018,7040)",
    vr: "LT",
    vm: "1",
    name: "GridAbsorbingMaterial"
  },
  "00187041": {
    tag: "(0018,7041)",
    vr: "LT",
    vm: "1",
    name: "GridSpacingMaterial"
  },
  "00187042": {
    tag: "(0018,7042)",
    vr: "DS",
    vm: "1",
    name: "GridThickness"
  },
  "00187044": {
    tag: "(0018,7044)",
    vr: "DS",
    vm: "1",
    name: "GridPitch"
  },
  "00187046": {
    tag: "(0018,7046)",
    vr: "IS",
    vm: "2",
    name: "GridAspectRatio"
  },
  "00187048": {
    tag: "(0018,7048)",
    vr: "DS",
    vm: "1",
    name: "GridPeriod"
  },
  "0018704C": {
    tag: "(0018,704C)",
    vr: "DS",
    vm: "1",
    name: "GridFocalDistance"
  },
  "00187050": {
    tag: "(0018,7050)",
    vr: "CS",
    vm: "1-n",
    name: "FilterMaterial"
  },
  "00187052": {
    tag: "(0018,7052)",
    vr: "DS",
    vm: "1-n",
    name: "FilterThicknessMinimum"
  },
  "00187054": {
    tag: "(0018,7054)",
    vr: "DS",
    vm: "1-n",
    name: "FilterThicknessMaximum"
  },
  "00187056": {
    tag: "(0018,7056)",
    vr: "FL",
    vm: "1-n",
    name: "FilterBeamPathLengthMinimum"
  },
  "00187058": {
    tag: "(0018,7058)",
    vr: "FL",
    vm: "1-n",
    name: "FilterBeamPathLengthMaximum"
  },
  "00187060": {
    tag: "(0018,7060)",
    vr: "CS",
    vm: "1",
    name: "ExposureControlMode"
  },
  "00187062": {
    tag: "(0018,7062)",
    vr: "LT",
    vm: "1",
    name: "ExposureControlModeDescription"
  },
  "00187064": {
    tag: "(0018,7064)",
    vr: "CS",
    vm: "1",
    name: "ExposureStatus"
  },
  "00187065": {
    tag: "(0018,7065)",
    vr: "DS",
    vm: "1",
    name: "PhototimerSetting"
  },
  "00188150": {
    tag: "(0018,8150)",
    vr: "DS",
    vm: "1",
    name: "ExposureTimeInuS"
  },
  "00188151": {
    tag: "(0018,8151)",
    vr: "DS",
    vm: "1",
    name: "XRayTubeCurrentInuA"
  },
  "00189004": {
    tag: "(0018,9004)",
    vr: "CS",
    vm: "1",
    name: "ContentQualification"
  },
  "00189005": {
    tag: "(0018,9005)",
    vr: "SH",
    vm: "1",
    name: "PulseSequenceName"
  },
  "00189006": {
    tag: "(0018,9006)",
    vr: "SQ",
    vm: "1",
    name: "MRImagingModifierSequence"
  },
  "00189008": {
    tag: "(0018,9008)",
    vr: "CS",
    vm: "1",
    name: "EchoPulseSequence"
  },
  "00189009": {
    tag: "(0018,9009)",
    vr: "CS",
    vm: "1",
    name: "InversionRecovery"
  },
  "00189010": {
    tag: "(0018,9010)",
    vr: "CS",
    vm: "1",
    name: "FlowCompensation"
  },
  "00189011": {
    tag: "(0018,9011)",
    vr: "CS",
    vm: "1",
    name: "MultipleSpinEcho"
  },
  "00189012": {
    tag: "(0018,9012)",
    vr: "CS",
    vm: "1",
    name: "MultiPlanarExcitation"
  },
  "00189014": {
    tag: "(0018,9014)",
    vr: "CS",
    vm: "1",
    name: "PhaseContrast"
  },
  "00189015": {
    tag: "(0018,9015)",
    vr: "CS",
    vm: "1",
    name: "TimeOfFlightContrast"
  },
  "00189016": {
    tag: "(0018,9016)",
    vr: "CS",
    vm: "1",
    name: "Spoiling"
  },
  "00189017": {
    tag: "(0018,9017)",
    vr: "CS",
    vm: "1",
    name: "SteadyStatePulseSequence"
  },
  "00189018": {
    tag: "(0018,9018)",
    vr: "CS",
    vm: "1",
    name: "EchoPlanarPulseSequence"
  },
  "00189019": {
    tag: "(0018,9019)",
    vr: "FD",
    vm: "1",
    name: "TagAngleFirstAxis"
  },
  "00189020": {
    tag: "(0018,9020)",
    vr: "CS",
    vm: "1",
    name: "MagnetizationTransfer"
  },
  "00189021": {
    tag: "(0018,9021)",
    vr: "CS",
    vm: "1",
    name: "T2Preparation"
  },
  "00189022": {
    tag: "(0018,9022)",
    vr: "CS",
    vm: "1",
    name: "BloodSignalNulling"
  },
  "00189024": {
    tag: "(0018,9024)",
    vr: "CS",
    vm: "1",
    name: "SaturationRecovery"
  },
  "00189025": {
    tag: "(0018,9025)",
    vr: "CS",
    vm: "1",
    name: "SpectrallySelectedSuppression"
  },
  "00189026": {
    tag: "(0018,9026)",
    vr: "CS",
    vm: "1",
    name: "SpectrallySelectedExcitation"
  },
  "00189027": {
    tag: "(0018,9027)",
    vr: "CS",
    vm: "1",
    name: "SpatialPresaturation"
  },
  "00189028": {
    tag: "(0018,9028)",
    vr: "CS",
    vm: "1",
    name: "Tagging"
  },
  "00189029": {
    tag: "(0018,9029)",
    vr: "CS",
    vm: "1",
    name: "OversamplingPhase"
  },
  "00189030": {
    tag: "(0018,9030)",
    vr: "FD",
    vm: "1",
    name: "TagSpacingFirstDimension"
  },
  "00189032": {
    tag: "(0018,9032)",
    vr: "CS",
    vm: "1",
    name: "GeometryOfKSpaceTraversal"
  },
  "00189033": {
    tag: "(0018,9033)",
    vr: "CS",
    vm: "1",
    name: "SegmentedKSpaceTraversal"
  },
  "00189034": {
    tag: "(0018,9034)",
    vr: "CS",
    vm: "1",
    name: "RectilinearPhaseEncodeReordering"
  },
  "00189035": {
    tag: "(0018,9035)",
    vr: "FD",
    vm: "1",
    name: "TagThickness"
  },
  "00189036": {
    tag: "(0018,9036)",
    vr: "CS",
    vm: "1",
    name: "PartialFourierDirection"
  },
  "00189037": {
    tag: "(0018,9037)",
    vr: "CS",
    vm: "1",
    name: "CardiacSynchronizationTechnique"
  },
  "00189041": {
    tag: "(0018,9041)",
    vr: "LO",
    vm: "1",
    name: "ReceiveCoilManufacturerName"
  },
  "00189042": {
    tag: "(0018,9042)",
    vr: "SQ",
    vm: "1",
    name: "MRReceiveCoilSequence"
  },
  "00189043": {
    tag: "(0018,9043)",
    vr: "CS",
    vm: "1",
    name: "ReceiveCoilType"
  },
  "00189044": {
    tag: "(0018,9044)",
    vr: "CS",
    vm: "1",
    name: "QuadratureReceiveCoil"
  },
  "00189045": {
    tag: "(0018,9045)",
    vr: "SQ",
    vm: "1",
    name: "MultiCoilDefinitionSequence"
  },
  "00189046": {
    tag: "(0018,9046)",
    vr: "LO",
    vm: "1",
    name: "MultiCoilConfiguration"
  },
  "00189047": {
    tag: "(0018,9047)",
    vr: "SH",
    vm: "1",
    name: "MultiCoilElementName"
  },
  "00189048": {
    tag: "(0018,9048)",
    vr: "CS",
    vm: "1",
    name: "MultiCoilElementUsed"
  },
  "00189049": {
    tag: "(0018,9049)",
    vr: "SQ",
    vm: "1",
    name: "MRTransmitCoilSequence"
  },
  "00189050": {
    tag: "(0018,9050)",
    vr: "LO",
    vm: "1",
    name: "TransmitCoilManufacturerName"
  },
  "00189051": {
    tag: "(0018,9051)",
    vr: "CS",
    vm: "1",
    name: "TransmitCoilType"
  },
  "00189052": {
    tag: "(0018,9052)",
    vr: "FD",
    vm: "1-2",
    name: "SpectralWidth"
  },
  "00189053": {
    tag: "(0018,9053)",
    vr: "FD",
    vm: "1-2",
    name: "ChemicalShiftReference"
  },
  "00189054": {
    tag: "(0018,9054)",
    vr: "CS",
    vm: "1",
    name: "VolumeLocalizationTechnique"
  },
  "00189058": {
    tag: "(0018,9058)",
    vr: "US",
    vm: "1",
    name: "MRAcquisitionFrequencyEncodingSteps"
  },
  "00189059": {
    tag: "(0018,9059)",
    vr: "CS",
    vm: "1",
    name: "Decoupling"
  },
  "00189060": {
    tag: "(0018,9060)",
    vr: "CS",
    vm: "1-2",
    name: "DecoupledNucleus"
  },
  "00189061": {
    tag: "(0018,9061)",
    vr: "FD",
    vm: "1-2",
    name: "DecouplingFrequency"
  },
  "00189062": {
    tag: "(0018,9062)",
    vr: "CS",
    vm: "1",
    name: "DecouplingMethod"
  },
  "00189063": {
    tag: "(0018,9063)",
    vr: "FD",
    vm: "1-2",
    name: "DecouplingChemicalShiftReference"
  },
  "00189064": {
    tag: "(0018,9064)",
    vr: "CS",
    vm: "1",
    name: "KSpaceFiltering"
  },
  "00189065": {
    tag: "(0018,9065)",
    vr: "CS",
    vm: "1-2",
    name: "TimeDomainFiltering"
  },
  "00189066": {
    tag: "(0018,9066)",
    vr: "US",
    vm: "1-2",
    name: "NumberOfZeroFills"
  },
  "00189067": {
    tag: "(0018,9067)",
    vr: "CS",
    vm: "1",
    name: "BaselineCorrection"
  },
  "00189069": {
    tag: "(0018,9069)",
    vr: "FD",
    vm: "1",
    name: "ParallelReductionFactorInPlane"
  },
  "00189070": {
    tag: "(0018,9070)",
    vr: "FD",
    vm: "1",
    name: "CardiacRRIntervalSpecified"
  },
  "00189073": {
    tag: "(0018,9073)",
    vr: "FD",
    vm: "1",
    name: "AcquisitionDuration"
  },
  "00189074": {
    tag: "(0018,9074)",
    vr: "DT",
    vm: "1",
    name: "FrameAcquisitionDateTime"
  },
  "00189075": {
    tag: "(0018,9075)",
    vr: "CS",
    vm: "1",
    name: "DiffusionDirectionality"
  },
  "00189076": {
    tag: "(0018,9076)",
    vr: "SQ",
    vm: "1",
    name: "DiffusionGradientDirectionSequence"
  },
  "00189077": {
    tag: "(0018,9077)",
    vr: "CS",
    vm: "1",
    name: "ParallelAcquisition"
  },
  "00189078": {
    tag: "(0018,9078)",
    vr: "CS",
    vm: "1",
    name: "ParallelAcquisitionTechnique"
  },
  "00189079": {
    tag: "(0018,9079)",
    vr: "FD",
    vm: "1-n",
    name: "InversionTimes"
  },
  "00189080": {
    tag: "(0018,9080)",
    vr: "ST",
    vm: "1",
    name: "MetaboliteMapDescription"
  },
  "00189081": {
    tag: "(0018,9081)",
    vr: "CS",
    vm: "1",
    name: "PartialFourier"
  },
  "00189082": {
    tag: "(0018,9082)",
    vr: "FD",
    vm: "1",
    name: "EffectiveEchoTime"
  },
  "00189083": {
    tag: "(0018,9083)",
    vr: "SQ",
    vm: "1",
    name: "MetaboliteMapCodeSequence"
  },
  "00189084": {
    tag: "(0018,9084)",
    vr: "SQ",
    vm: "1",
    name: "ChemicalShiftSequence"
  },
  "00189085": {
    tag: "(0018,9085)",
    vr: "CS",
    vm: "1",
    name: "CardiacSignalSource"
  },
  "00189087": {
    tag: "(0018,9087)",
    vr: "FD",
    vm: "1",
    name: "DiffusionBValue"
  },
  "00189089": {
    tag: "(0018,9089)",
    vr: "FD",
    vm: "3",
    name: "DiffusionGradientOrientation"
  },
  "00189090": {
    tag: "(0018,9090)",
    vr: "FD",
    vm: "3",
    name: "VelocityEncodingDirection"
  },
  "00189091": {
    tag: "(0018,9091)",
    vr: "FD",
    vm: "1",
    name: "VelocityEncodingMinimumValue"
  },
  "00189092": {
    tag: "(0018,9092)",
    vr: "SQ",
    vm: "1",
    name: "VelocityEncodingAcquisitionSequence"
  },
  "00189093": {
    tag: "(0018,9093)",
    vr: "US",
    vm: "1",
    name: "NumberOfKSpaceTrajectories"
  },
  "00189094": {
    tag: "(0018,9094)",
    vr: "CS",
    vm: "1",
    name: "CoverageOfKSpace"
  },
  "00189095": {
    tag: "(0018,9095)",
    vr: "UL",
    vm: "1",
    name: "SpectroscopyAcquisitionPhaseRows"
  },
  "00189096": {
    tag: "(0018,9096)",
    vr: "FD",
    vm: "1",
    name: "ParallelReductionFactorInPlaneRetired"
  },
  "00189098": {
    tag: "(0018,9098)",
    vr: "FD",
    vm: "1-2",
    name: "TransmitterFrequency"
  },
  "00189100": {
    tag: "(0018,9100)",
    vr: "CS",
    vm: "1-2",
    name: "ResonantNucleus"
  },
  "00189101": {
    tag: "(0018,9101)",
    vr: "CS",
    vm: "1",
    name: "FrequencyCorrection"
  },
  "00189103": {
    tag: "(0018,9103)",
    vr: "SQ",
    vm: "1",
    name: "MRSpectroscopyFOVGeometrySequence"
  },
  "00189104": {
    tag: "(0018,9104)",
    vr: "FD",
    vm: "1",
    name: "SlabThickness"
  },
  "00189105": {
    tag: "(0018,9105)",
    vr: "FD",
    vm: "3",
    name: "SlabOrientation"
  },
  "00189106": {
    tag: "(0018,9106)",
    vr: "FD",
    vm: "3",
    name: "MidSlabPosition"
  },
  "00189107": {
    tag: "(0018,9107)",
    vr: "SQ",
    vm: "1",
    name: "MRSpatialSaturationSequence"
  },
  "00189112": {
    tag: "(0018,9112)",
    vr: "SQ",
    vm: "1",
    name: "MRTimingAndRelatedParametersSequence"
  },
  "00189114": {
    tag: "(0018,9114)",
    vr: "SQ",
    vm: "1",
    name: "MREchoSequence"
  },
  "00189115": {
    tag: "(0018,9115)",
    vr: "SQ",
    vm: "1",
    name: "MRModifierSequence"
  },
  "00189117": {
    tag: "(0018,9117)",
    vr: "SQ",
    vm: "1",
    name: "MRDiffusionSequence"
  },
  "00189118": {
    tag: "(0018,9118)",
    vr: "SQ",
    vm: "1",
    name: "CardiacSynchronizationSequence"
  },
  "00189119": {
    tag: "(0018,9119)",
    vr: "SQ",
    vm: "1",
    name: "MRAveragesSequence"
  },
  "00189125": {
    tag: "(0018,9125)",
    vr: "SQ",
    vm: "1",
    name: "MRFOVGeometrySequence"
  },
  "00189126": {
    tag: "(0018,9126)",
    vr: "SQ",
    vm: "1",
    name: "VolumeLocalizationSequence"
  },
  "00189127": {
    tag: "(0018,9127)",
    vr: "UL",
    vm: "1",
    name: "SpectroscopyAcquisitionDataColumns"
  },
  "00189147": {
    tag: "(0018,9147)",
    vr: "CS",
    vm: "1",
    name: "DiffusionAnisotropyType"
  },
  "00189151": {
    tag: "(0018,9151)",
    vr: "DT",
    vm: "1",
    name: "FrameReferenceDateTime"
  },
  "00189152": {
    tag: "(0018,9152)",
    vr: "SQ",
    vm: "1",
    name: "MRMetaboliteMapSequence"
  },
  "00189155": {
    tag: "(0018,9155)",
    vr: "FD",
    vm: "1",
    name: "ParallelReductionFactorOutOfPlane"
  },
  "00189159": {
    tag: "(0018,9159)",
    vr: "UL",
    vm: "1",
    name: "SpectroscopyAcquisitionOutOfPlanePhaseSteps"
  },
  "00189166": {
    tag: "(0018,9166)",
    vr: "CS",
    vm: "1",
    name: "BulkMotionStatus"
  },
  "00189168": {
    tag: "(0018,9168)",
    vr: "FD",
    vm: "1",
    name: "ParallelReductionFactorSecondInPlane"
  },
  "00189169": {
    tag: "(0018,9169)",
    vr: "CS",
    vm: "1",
    name: "CardiacBeatRejectionTechnique"
  },
  "00189170": {
    tag: "(0018,9170)",
    vr: "CS",
    vm: "1",
    name: "RespiratoryMotionCompensationTechnique"
  },
  "00189171": {
    tag: "(0018,9171)",
    vr: "CS",
    vm: "1",
    name: "RespiratorySignalSource"
  },
  "00189172": {
    tag: "(0018,9172)",
    vr: "CS",
    vm: "1",
    name: "BulkMotionCompensationTechnique"
  },
  "00189173": {
    tag: "(0018,9173)",
    vr: "CS",
    vm: "1",
    name: "BulkMotionSignalSource"
  },
  "00189174": {
    tag: "(0018,9174)",
    vr: "CS",
    vm: "1",
    name: "ApplicableSafetyStandardAgency"
  },
  "00189175": {
    tag: "(0018,9175)",
    vr: "LO",
    vm: "1",
    name: "ApplicableSafetyStandardDescription"
  },
  "00189176": {
    tag: "(0018,9176)",
    vr: "SQ",
    vm: "1",
    name: "OperatingModeSequence"
  },
  "00189177": {
    tag: "(0018,9177)",
    vr: "CS",
    vm: "1",
    name: "OperatingModeType"
  },
  "00189178": {
    tag: "(0018,9178)",
    vr: "CS",
    vm: "1",
    name: "OperatingMode"
  },
  "00189179": {
    tag: "(0018,9179)",
    vr: "CS",
    vm: "1",
    name: "SpecificAbsorptionRateDefinition"
  },
  "00189180": {
    tag: "(0018,9180)",
    vr: "CS",
    vm: "1",
    name: "GradientOutputType"
  },
  "00189181": {
    tag: "(0018,9181)",
    vr: "FD",
    vm: "1",
    name: "SpecificAbsorptionRateValue"
  },
  "00189182": {
    tag: "(0018,9182)",
    vr: "FD",
    vm: "1",
    name: "GradientOutput"
  },
  "00189183": {
    tag: "(0018,9183)",
    vr: "CS",
    vm: "1",
    name: "FlowCompensationDirection"
  },
  "00189184": {
    tag: "(0018,9184)",
    vr: "FD",
    vm: "1",
    name: "TaggingDelay"
  },
  "00189185": {
    tag: "(0018,9185)",
    vr: "ST",
    vm: "1",
    name: "RespiratoryMotionCompensationTechniqueDescription"
  },
  "00189186": {
    tag: "(0018,9186)",
    vr: "SH",
    vm: "1",
    name: "RespiratorySignalSourceID"
  },
  "00189195": {
    tag: "(0018,9195)",
    vr: "FD",
    vm: "1",
    name: "ChemicalShiftMinimumIntegrationLimitInHz"
  },
  "00189196": {
    tag: "(0018,9196)",
    vr: "FD",
    vm: "1",
    name: "ChemicalShiftMaximumIntegrationLimitInHz"
  },
  "00189197": {
    tag: "(0018,9197)",
    vr: "SQ",
    vm: "1",
    name: "MRVelocityEncodingSequence"
  },
  "00189198": {
    tag: "(0018,9198)",
    vr: "CS",
    vm: "1",
    name: "FirstOrderPhaseCorrection"
  },
  "00189199": {
    tag: "(0018,9199)",
    vr: "CS",
    vm: "1",
    name: "WaterReferencedPhaseCorrection"
  },
  "00189200": {
    tag: "(0018,9200)",
    vr: "CS",
    vm: "1",
    name: "MRSpectroscopyAcquisitionType"
  },
  "00189214": {
    tag: "(0018,9214)",
    vr: "CS",
    vm: "1",
    name: "RespiratoryCyclePosition"
  },
  "00189217": {
    tag: "(0018,9217)",
    vr: "FD",
    vm: "1",
    name: "VelocityEncodingMaximumValue"
  },
  "00189218": {
    tag: "(0018,9218)",
    vr: "FD",
    vm: "1",
    name: "TagSpacingSecondDimension"
  },
  "00189219": {
    tag: "(0018,9219)",
    vr: "SS",
    vm: "1",
    name: "TagAngleSecondAxis"
  },
  "00189220": {
    tag: "(0018,9220)",
    vr: "FD",
    vm: "1",
    name: "FrameAcquisitionDuration"
  },
  "00189226": {
    tag: "(0018,9226)",
    vr: "SQ",
    vm: "1",
    name: "MRImageFrameTypeSequence"
  },
  "00189227": {
    tag: "(0018,9227)",
    vr: "SQ",
    vm: "1",
    name: "MRSpectroscopyFrameTypeSequence"
  },
  "00189231": {
    tag: "(0018,9231)",
    vr: "US",
    vm: "1",
    name: "MRAcquisitionPhaseEncodingStepsInPlane"
  },
  "00189232": {
    tag: "(0018,9232)",
    vr: "US",
    vm: "1",
    name: "MRAcquisitionPhaseEncodingStepsOutOfPlane"
  },
  "00189234": {
    tag: "(0018,9234)",
    vr: "UL",
    vm: "1",
    name: "SpectroscopyAcquisitionPhaseColumns"
  },
  "00189236": {
    tag: "(0018,9236)",
    vr: "CS",
    vm: "1",
    name: "CardiacCyclePosition"
  },
  "00189239": {
    tag: "(0018,9239)",
    vr: "SQ",
    vm: "1",
    name: "SpecificAbsorptionRateSequence"
  },
  "00189240": {
    tag: "(0018,9240)",
    vr: "US",
    vm: "1",
    name: "RFEchoTrainLength"
  },
  "00189241": {
    tag: "(0018,9241)",
    vr: "US",
    vm: "1",
    name: "GradientEchoTrainLength"
  },
  "00189250": {
    tag: "(0018,9250)",
    vr: "CS",
    vm: "1",
    name: "ArterialSpinLabelingContrast"
  },
  "00189251": {
    tag: "(0018,9251)",
    vr: "SQ",
    vm: "1",
    name: "MRArterialSpinLabelingSequence"
  },
  "00189252": {
    tag: "(0018,9252)",
    vr: "LO",
    vm: "1",
    name: "ASLTechniqueDescription"
  },
  "00189253": {
    tag: "(0018,9253)",
    vr: "US",
    vm: "1",
    name: "ASLSlabNumber"
  },
  "00189254": {
    tag: "(0018,9254)",
    vr: "FD",
    vm: "1",
    name: "ASLSlabThickness"
  },
  "00189255": {
    tag: "(0018,9255)",
    vr: "FD",
    vm: "3",
    name: "ASLSlabOrientation"
  },
  "00189256": {
    tag: "(0018,9256)",
    vr: "FD",
    vm: "3",
    name: "ASLMidSlabPosition"
  },
  "00189257": {
    tag: "(0018,9257)",
    vr: "CS",
    vm: "1",
    name: "ASLContext"
  },
  "00189258": {
    tag: "(0018,9258)",
    vr: "UL",
    vm: "1",
    name: "ASLPulseTrainDuration"
  },
  "00189259": {
    tag: "(0018,9259)",
    vr: "CS",
    vm: "1",
    name: "ASLCrusherFlag"
  },
  "0018925A": {
    tag: "(0018,925A)",
    vr: "FD",
    vm: "1",
    name: "ASLCrusherFlowLimit"
  },
  "0018925B": {
    tag: "(0018,925B)",
    vr: "LO",
    vm: "1",
    name: "ASLCrusherDescription"
  },
  "0018925C": {
    tag: "(0018,925C)",
    vr: "CS",
    vm: "1",
    name: "ASLBolusCutoffFlag"
  },
  "0018925D": {
    tag: "(0018,925D)",
    vr: "SQ",
    vm: "1",
    name: "ASLBolusCutoffTimingSequence"
  },
  "0018925E": {
    tag: "(0018,925E)",
    vr: "LO",
    vm: "1",
    name: "ASLBolusCutoffTechnique"
  },
  "0018925F": {
    tag: "(0018,925F)",
    vr: "UL",
    vm: "1",
    name: "ASLBolusCutoffDelayTime"
  },
  "00189260": {
    tag: "(0018,9260)",
    vr: "SQ",
    vm: "1",
    name: "ASLSlabSequence"
  },
  "00189295": {
    tag: "(0018,9295)",
    vr: "FD",
    vm: "1",
    name: "ChemicalShiftMinimumIntegrationLimitInppm"
  },
  "00189296": {
    tag: "(0018,9296)",
    vr: "FD",
    vm: "1",
    name: "ChemicalShiftMaximumIntegrationLimitInppm"
  },
  "00189297": {
    tag: "(0018,9297)",
    vr: "CS",
    vm: "1",
    name: "WaterReferenceAcquisition"
  },
  "00189298": {
    tag: "(0018,9298)",
    vr: "IS",
    vm: "1",
    name: "EchoPeakPosition"
  },
  "00189301": {
    tag: "(0018,9301)",
    vr: "SQ",
    vm: "1",
    name: "CTAcquisitionTypeSequence"
  },
  "00189302": {
    tag: "(0018,9302)",
    vr: "CS",
    vm: "1",
    name: "AcquisitionType"
  },
  "00189303": {
    tag: "(0018,9303)",
    vr: "FD",
    vm: "1",
    name: "TubeAngle"
  },
  "00189304": {
    tag: "(0018,9304)",
    vr: "SQ",
    vm: "1",
    name: "CTAcquisitionDetailsSequence"
  },
  "00189305": {
    tag: "(0018,9305)",
    vr: "FD",
    vm: "1",
    name: "RevolutionTime"
  },
  "00189306": {
    tag: "(0018,9306)",
    vr: "FD",
    vm: "1",
    name: "SingleCollimationWidth"
  },
  "00189307": {
    tag: "(0018,9307)",
    vr: "FD",
    vm: "1",
    name: "TotalCollimationWidth"
  },
  "00189308": {
    tag: "(0018,9308)",
    vr: "SQ",
    vm: "1",
    name: "CTTableDynamicsSequence"
  },
  "00189309": {
    tag: "(0018,9309)",
    vr: "FD",
    vm: "1",
    name: "TableSpeed"
  },
  "00189310": {
    tag: "(0018,9310)",
    vr: "FD",
    vm: "1",
    name: "TableFeedPerRotation"
  },
  "00189311": {
    tag: "(0018,9311)",
    vr: "FD",
    vm: "1",
    name: "SpiralPitchFactor"
  },
  "00189312": {
    tag: "(0018,9312)",
    vr: "SQ",
    vm: "1",
    name: "CTGeometrySequence"
  },
  "00189313": {
    tag: "(0018,9313)",
    vr: "FD",
    vm: "3",
    name: "DataCollectionCenterPatient"
  },
  "00189314": {
    tag: "(0018,9314)",
    vr: "SQ",
    vm: "1",
    name: "CTReconstructionSequence"
  },
  "00189315": {
    tag: "(0018,9315)",
    vr: "CS",
    vm: "1",
    name: "ReconstructionAlgorithm"
  },
  "00189316": {
    tag: "(0018,9316)",
    vr: "CS",
    vm: "1",
    name: "ConvolutionKernelGroup"
  },
  "00189317": {
    tag: "(0018,9317)",
    vr: "FD",
    vm: "2",
    name: "ReconstructionFieldOfView"
  },
  "00189318": {
    tag: "(0018,9318)",
    vr: "FD",
    vm: "3",
    name: "ReconstructionTargetCenterPatient"
  },
  "00189319": {
    tag: "(0018,9319)",
    vr: "FD",
    vm: "1",
    name: "ReconstructionAngle"
  },
  "00189320": {
    tag: "(0018,9320)",
    vr: "SH",
    vm: "1",
    name: "ImageFilter"
  },
  "00189321": {
    tag: "(0018,9321)",
    vr: "SQ",
    vm: "1",
    name: "CTExposureSequence"
  },
  "00189322": {
    tag: "(0018,9322)",
    vr: "FD",
    vm: "2",
    name: "ReconstructionPixelSpacing"
  },
  "00189323": {
    tag: "(0018,9323)",
    vr: "CS",
    vm: "1-n",
    name: "ExposureModulationType"
  },
  "00189324": {
    tag: "(0018,9324)",
    vr: "FD",
    vm: "1",
    name: "EstimatedDoseSaving"
  },
  "00189325": {
    tag: "(0018,9325)",
    vr: "SQ",
    vm: "1",
    name: "CTXRayDetailsSequence"
  },
  "00189326": {
    tag: "(0018,9326)",
    vr: "SQ",
    vm: "1",
    name: "CTPositionSequence"
  },
  "00189327": {
    tag: "(0018,9327)",
    vr: "FD",
    vm: "1",
    name: "TablePosition"
  },
  "00189328": {
    tag: "(0018,9328)",
    vr: "FD",
    vm: "1",
    name: "ExposureTimeInms"
  },
  "00189329": {
    tag: "(0018,9329)",
    vr: "SQ",
    vm: "1",
    name: "CTImageFrameTypeSequence"
  },
  "00189330": {
    tag: "(0018,9330)",
    vr: "FD",
    vm: "1",
    name: "XRayTubeCurrentInmA"
  },
  "00189332": {
    tag: "(0018,9332)",
    vr: "FD",
    vm: "1",
    name: "ExposureInmAs"
  },
  "00189333": {
    tag: "(0018,9333)",
    vr: "CS",
    vm: "1",
    name: "ConstantVolumeFlag"
  },
  "00189334": {
    tag: "(0018,9334)",
    vr: "CS",
    vm: "1",
    name: "FluoroscopyFlag"
  },
  "00189335": {
    tag: "(0018,9335)",
    vr: "FD",
    vm: "1",
    name: "DistanceSourceToDataCollectionCenter"
  },
  "00189337": {
    tag: "(0018,9337)",
    vr: "US",
    vm: "1",
    name: "ContrastBolusAgentNumber"
  },
  "00189338": {
    tag: "(0018,9338)",
    vr: "SQ",
    vm: "1",
    name: "ContrastBolusIngredientCodeSequence"
  },
  "00189340": {
    tag: "(0018,9340)",
    vr: "SQ",
    vm: "1",
    name: "ContrastAdministrationProfileSequence"
  },
  "00189341": {
    tag: "(0018,9341)",
    vr: "SQ",
    vm: "1",
    name: "ContrastBolusUsageSequence"
  },
  "00189342": {
    tag: "(0018,9342)",
    vr: "CS",
    vm: "1",
    name: "ContrastBolusAgentAdministered"
  },
  "00189343": {
    tag: "(0018,9343)",
    vr: "CS",
    vm: "1",
    name: "ContrastBolusAgentDetected"
  },
  "00189344": {
    tag: "(0018,9344)",
    vr: "CS",
    vm: "1",
    name: "ContrastBolusAgentPhase"
  },
  "00189345": {
    tag: "(0018,9345)",
    vr: "FD",
    vm: "1",
    name: "CTDIvol"
  },
  "00189346": {
    tag: "(0018,9346)",
    vr: "SQ",
    vm: "1",
    name: "CTDIPhantomTypeCodeSequence"
  },
  "00189351": {
    tag: "(0018,9351)",
    vr: "FL",
    vm: "1",
    name: "CalciumScoringMassFactorPatient"
  },
  "00189352": {
    tag: "(0018,9352)",
    vr: "FL",
    vm: "3",
    name: "CalciumScoringMassFactorDevice"
  },
  "00189353": {
    tag: "(0018,9353)",
    vr: "FL",
    vm: "1",
    name: "EnergyWeightingFactor"
  },
  "00189360": {
    tag: "(0018,9360)",
    vr: "SQ",
    vm: "1",
    name: "CTAdditionalXRaySourceSequence"
  },
  "00189401": {
    tag: "(0018,9401)",
    vr: "SQ",
    vm: "1",
    name: "ProjectionPixelCalibrationSequence"
  },
  "00189402": {
    tag: "(0018,9402)",
    vr: "FL",
    vm: "1",
    name: "DistanceSourceToIsocenter"
  },
  "00189403": {
    tag: "(0018,9403)",
    vr: "FL",
    vm: "1",
    name: "DistanceObjectToTableTop"
  },
  "00189404": {
    tag: "(0018,9404)",
    vr: "FL",
    vm: "2",
    name: "ObjectPixelSpacingInCenterOfBeam"
  },
  "00189405": {
    tag: "(0018,9405)",
    vr: "SQ",
    vm: "1",
    name: "PositionerPositionSequence"
  },
  "00189406": {
    tag: "(0018,9406)",
    vr: "SQ",
    vm: "1",
    name: "TablePositionSequence"
  },
  "00189407": {
    tag: "(0018,9407)",
    vr: "SQ",
    vm: "1",
    name: "CollimatorShapeSequence"
  },
  "00189410": {
    tag: "(0018,9410)",
    vr: "CS",
    vm: "1",
    name: "PlanesInAcquisition"
  },
  "00189412": {
    tag: "(0018,9412)",
    vr: "SQ",
    vm: "1",
    name: "XAXRFFrameCharacteristicsSequence"
  },
  "00189417": {
    tag: "(0018,9417)",
    vr: "SQ",
    vm: "1",
    name: "FrameAcquisitionSequence"
  },
  "00189420": {
    tag: "(0018,9420)",
    vr: "CS",
    vm: "1",
    name: "XRayReceptorType"
  },
  "00189423": {
    tag: "(0018,9423)",
    vr: "LO",
    vm: "1",
    name: "AcquisitionProtocolName"
  },
  "00189424": {
    tag: "(0018,9424)",
    vr: "LT",
    vm: "1",
    name: "AcquisitionProtocolDescription"
  },
  "00189425": {
    tag: "(0018,9425)",
    vr: "CS",
    vm: "1",
    name: "ContrastBolusIngredientOpaque"
  },
  "00189426": {
    tag: "(0018,9426)",
    vr: "FL",
    vm: "1",
    name: "DistanceReceptorPlaneToDetectorHousing"
  },
  "00189427": {
    tag: "(0018,9427)",
    vr: "CS",
    vm: "1",
    name: "IntensifierActiveShape"
  },
  "00189428": {
    tag: "(0018,9428)",
    vr: "FL",
    vm: "1-2",
    name: "IntensifierActiveDimensions"
  },
  "00189429": {
    tag: "(0018,9429)",
    vr: "FL",
    vm: "2",
    name: "PhysicalDetectorSize"
  },
  "00189430": {
    tag: "(0018,9430)",
    vr: "FL",
    vm: "2",
    name: "PositionOfIsocenterProjection"
  },
  "00189432": {
    tag: "(0018,9432)",
    vr: "SQ",
    vm: "1",
    name: "FieldOfViewSequence"
  },
  "00189433": {
    tag: "(0018,9433)",
    vr: "LO",
    vm: "1",
    name: "FieldOfViewDescription"
  },
  "00189434": {
    tag: "(0018,9434)",
    vr: "SQ",
    vm: "1",
    name: "ExposureControlSensingRegionsSequence"
  },
  "00189435": {
    tag: "(0018,9435)",
    vr: "CS",
    vm: "1",
    name: "ExposureControlSensingRegionShape"
  },
  "00189436": {
    tag: "(0018,9436)",
    vr: "SS",
    vm: "1",
    name: "ExposureControlSensingRegionLeftVerticalEdge"
  },
  "00189437": {
    tag: "(0018,9437)",
    vr: "SS",
    vm: "1",
    name: "ExposureControlSensingRegionRightVerticalEdge"
  },
  "00189438": {
    tag: "(0018,9438)",
    vr: "SS",
    vm: "1",
    name: "ExposureControlSensingRegionUpperHorizontalEdge"
  },
  "00189439": {
    tag: "(0018,9439)",
    vr: "SS",
    vm: "1",
    name: "ExposureControlSensingRegionLowerHorizontalEdge"
  },
  "00189440": {
    tag: "(0018,9440)",
    vr: "SS",
    vm: "2",
    name: "CenterOfCircularExposureControlSensingRegion"
  },
  "00189441": {
    tag: "(0018,9441)",
    vr: "US",
    vm: "1",
    name: "RadiusOfCircularExposureControlSensingRegion"
  },
  "00189442": {
    tag: "(0018,9442)",
    vr: "SS",
    vm: "2-n",
    name: "VerticesOfThePolygonalExposureControlSensingRegion"
  },
  "00189445": {
    tag: "(0018,9445)",
    name: "",
    vr: "",
    vm: ""
  },
  "00189447": {
    tag: "(0018,9447)",
    vr: "FL",
    vm: "1",
    name: "ColumnAngulationPatient"
  },
  "00189449": {
    tag: "(0018,9449)",
    vr: "FL",
    vm: "1",
    name: "BeamAngle"
  },
  "00189451": {
    tag: "(0018,9451)",
    vr: "SQ",
    vm: "1",
    name: "FrameDetectorParametersSequence"
  },
  "00189452": {
    tag: "(0018,9452)",
    vr: "FL",
    vm: "1",
    name: "CalculatedAnatomyThickness"
  },
  "00189455": {
    tag: "(0018,9455)",
    vr: "SQ",
    vm: "1",
    name: "CalibrationSequence"
  },
  "00189456": {
    tag: "(0018,9456)",
    vr: "SQ",
    vm: "1",
    name: "ObjectThicknessSequence"
  },
  "00189457": {
    tag: "(0018,9457)",
    vr: "CS",
    vm: "1",
    name: "PlaneIdentification"
  },
  "00189461": {
    tag: "(0018,9461)",
    vr: "FL",
    vm: "1-2",
    name: "FieldOfViewDimensionsInFloat"
  },
  "00189462": {
    tag: "(0018,9462)",
    vr: "SQ",
    vm: "1",
    name: "IsocenterReferenceSystemSequence"
  },
  "00189463": {
    tag: "(0018,9463)",
    vr: "FL",
    vm: "1",
    name: "PositionerIsocenterPrimaryAngle"
  },
  "00189464": {
    tag: "(0018,9464)",
    vr: "FL",
    vm: "1",
    name: "PositionerIsocenterSecondaryAngle"
  },
  "00189465": {
    tag: "(0018,9465)",
    vr: "FL",
    vm: "1",
    name: "PositionerIsocenterDetectorRotationAngle"
  },
  "00189466": {
    tag: "(0018,9466)",
    vr: "FL",
    vm: "1",
    name: "TableXPositionToIsocenter"
  },
  "00189467": {
    tag: "(0018,9467)",
    vr: "FL",
    vm: "1",
    name: "TableYPositionToIsocenter"
  },
  "00189468": {
    tag: "(0018,9468)",
    vr: "FL",
    vm: "1",
    name: "TableZPositionToIsocenter"
  },
  "00189469": {
    tag: "(0018,9469)",
    vr: "FL",
    vm: "1",
    name: "TableHorizontalRotationAngle"
  },
  "00189470": {
    tag: "(0018,9470)",
    vr: "FL",
    vm: "1",
    name: "TableHeadTiltAngle"
  },
  "00189471": {
    tag: "(0018,9471)",
    vr: "FL",
    vm: "1",
    name: "TableCradleTiltAngle"
  },
  "00189472": {
    tag: "(0018,9472)",
    vr: "SQ",
    vm: "1",
    name: "FrameDisplayShutterSequence"
  },
  "00189473": {
    tag: "(0018,9473)",
    vr: "FL",
    vm: "1",
    name: "AcquiredImageAreaDoseProduct"
  },
  "00189474": {
    tag: "(0018,9474)",
    vr: "CS",
    vm: "1",
    name: "CArmPositionerTabletopRelationship"
  },
  "00189476": {
    tag: "(0018,9476)",
    vr: "SQ",
    vm: "1",
    name: "XRayGeometrySequence"
  },
  "00189477": {
    tag: "(0018,9477)",
    vr: "SQ",
    vm: "1",
    name: "IrradiationEventIdentificationSequence"
  },
  "00189504": {
    tag: "(0018,9504)",
    vr: "SQ",
    vm: "1",
    name: "XRay3DFrameTypeSequence"
  },
  "00189506": {
    tag: "(0018,9506)",
    vr: "SQ",
    vm: "1",
    name: "ContributingSourcesSequence"
  },
  "00189507": {
    tag: "(0018,9507)",
    vr: "SQ",
    vm: "1",
    name: "XRay3DAcquisitionSequence"
  },
  "00189508": {
    tag: "(0018,9508)",
    vr: "FL",
    vm: "1",
    name: "PrimaryPositionerScanArc"
  },
  "00189509": {
    tag: "(0018,9509)",
    vr: "FL",
    vm: "1",
    name: "SecondaryPositionerScanArc"
  },
  "00189510": {
    tag: "(0018,9510)",
    vr: "FL",
    vm: "1",
    name: "PrimaryPositionerScanStartAngle"
  },
  "00189511": {
    tag: "(0018,9511)",
    vr: "FL",
    vm: "1",
    name: "SecondaryPositionerScanStartAngle"
  },
  "00189514": {
    tag: "(0018,9514)",
    vr: "FL",
    vm: "1",
    name: "PrimaryPositionerIncrement"
  },
  "00189515": {
    tag: "(0018,9515)",
    vr: "FL",
    vm: "1",
    name: "SecondaryPositionerIncrement"
  },
  "00189516": {
    tag: "(0018,9516)",
    vr: "DT",
    vm: "1",
    name: "StartAcquisitionDateTime"
  },
  "00189517": {
    tag: "(0018,9517)",
    vr: "DT",
    vm: "1",
    name: "EndAcquisitionDateTime"
  },
  "00189518": {
    tag: "(0018,9518)",
    vr: "SS",
    vm: "1",
    name: "PrimaryPositionerIncrementSign"
  },
  "00189519": {
    tag: "(0018,9519)",
    vr: "SS",
    vm: "1",
    name: "SecondaryPositionerIncrementSign"
  },
  "00189524": {
    tag: "(0018,9524)",
    vr: "LO",
    vm: "1",
    name: "ApplicationName"
  },
  "00189525": {
    tag: "(0018,9525)",
    vr: "LO",
    vm: "1",
    name: "ApplicationVersion"
  },
  "00189526": {
    tag: "(0018,9526)",
    vr: "LO",
    vm: "1",
    name: "ApplicationManufacturer"
  },
  "00189527": {
    tag: "(0018,9527)",
    vr: "CS",
    vm: "1",
    name: "AlgorithmType"
  },
  "00189528": {
    tag: "(0018,9528)",
    vr: "LO",
    vm: "1",
    name: "AlgorithmDescription"
  },
  "00189530": {
    tag: "(0018,9530)",
    vr: "SQ",
    vm: "1",
    name: "XRay3DReconstructionSequence"
  },
  "00189531": {
    tag: "(0018,9531)",
    vr: "LO",
    vm: "1",
    name: "ReconstructionDescription"
  },
  "00189538": {
    tag: "(0018,9538)",
    vr: "SQ",
    vm: "1",
    name: "PerProjectionAcquisitionSequence"
  },
  "00189541": {
    tag: "(0018,9541)",
    vr: "SQ",
    vm: "1",
    name: "DetectorPositionSequence"
  },
  "00189542": {
    tag: "(0018,9542)",
    vr: "SQ",
    vm: "1",
    name: "XRayAcquisitionDoseSequence"
  },
  "00189543": {
    tag: "(0018,9543)",
    vr: "FD",
    vm: "1",
    name: "XRaySourceIsocenterPrimaryAngle"
  },
  "00189544": {
    tag: "(0018,9544)",
    vr: "FD",
    vm: "1",
    name: "XRaySourceIsocenterSecondaryAngle"
  },
  "00189545": {
    tag: "(0018,9545)",
    vr: "FD",
    vm: "1",
    name: "BreastSupportIsocenterPrimaryAngle"
  },
  "00189546": {
    tag: "(0018,9546)",
    vr: "FD",
    vm: "1",
    name: "BreastSupportIsocenterSecondaryAngle"
  },
  "00189547": {
    tag: "(0018,9547)",
    vr: "FD",
    vm: "1",
    name: "BreastSupportXPositionToIsocenter"
  },
  "00189548": {
    tag: "(0018,9548)",
    vr: "FD",
    vm: "1",
    name: "BreastSupportYPositionToIsocenter"
  },
  "00189549": {
    tag: "(0018,9549)",
    vr: "FD",
    vm: "1",
    name: "BreastSupportZPositionToIsocenter"
  },
  "00189550": {
    tag: "(0018,9550)",
    vr: "FD",
    vm: "1",
    name: "DetectorIsocenterPrimaryAngle"
  },
  "00189551": {
    tag: "(0018,9551)",
    vr: "FD",
    vm: "1",
    name: "DetectorIsocenterSecondaryAngle"
  },
  "00189552": {
    tag: "(0018,9552)",
    vr: "FD",
    vm: "1",
    name: "DetectorXPositionToIsocenter"
  },
  "00189553": {
    tag: "(0018,9553)",
    vr: "FD",
    vm: "1",
    name: "DetectorYPositionToIsocenter"
  },
  "00189554": {
    tag: "(0018,9554)",
    vr: "FD",
    vm: "1",
    name: "DetectorZPositionToIsocenter"
  },
  "00189555": {
    tag: "(0018,9555)",
    vr: "SQ",
    vm: "1",
    name: "XRayGridSequence"
  },
  "00189556": {
    tag: "(0018,9556)",
    vr: "SQ",
    vm: "1",
    name: "XRayFilterSequence"
  },
  "00189557": {
    tag: "(0018,9557)",
    vr: "FD",
    vm: "3",
    name: "DetectorActiveAreaTLHCPosition"
  },
  "00189558": {
    tag: "(0018,9558)",
    vr: "FD",
    vm: "6",
    name: "DetectorActiveAreaOrientation"
  },
  "00189559": {
    tag: "(0018,9559)",
    vr: "CS",
    vm: "1",
    name: "PositionerPrimaryAngleDirection"
  },
  "00189601": {
    tag: "(0018,9601)",
    vr: "SQ",
    vm: "1",
    name: "DiffusionBMatrixSequence"
  },
  "00189602": {
    tag: "(0018,9602)",
    vr: "FD",
    vm: "1",
    name: "DiffusionBValueXX"
  },
  "00189603": {
    tag: "(0018,9603)",
    vr: "FD",
    vm: "1",
    name: "DiffusionBValueXY"
  },
  "00189604": {
    tag: "(0018,9604)",
    vr: "FD",
    vm: "1",
    name: "DiffusionBValueXZ"
  },
  "00189605": {
    tag: "(0018,9605)",
    vr: "FD",
    vm: "1",
    name: "DiffusionBValueYY"
  },
  "00189606": {
    tag: "(0018,9606)",
    vr: "FD",
    vm: "1",
    name: "DiffusionBValueYZ"
  },
  "00189607": {
    tag: "(0018,9607)",
    vr: "FD",
    vm: "1",
    name: "DiffusionBValueZZ"
  },
  "00189621": {
    tag: "(0018,9621)",
    vr: "SQ",
    vm: "1",
    name: "FunctionalMRSequence"
  },
  "00189622": {
    tag: "(0018,9622)",
    vr: "CS",
    vm: "1",
    name: "FunctionalSettlingPhaseFramesPresent"
  },
  "00189623": {
    tag: "(0018,9623)",
    vr: "DT",
    vm: "1",
    name: "FunctionalSyncPulse"
  },
  "00189624": {
    tag: "(0018,9624)",
    vr: "CS",
    vm: "1",
    name: "SettlingPhaseFrame"
  },
  "00189701": {
    tag: "(0018,9701)",
    vr: "DT",
    vm: "1",
    name: "DecayCorrectionDateTime"
  },
  "00189715": {
    tag: "(0018,9715)",
    vr: "FD",
    vm: "1",
    name: "StartDensityThreshold"
  },
  "00189716": {
    tag: "(0018,9716)",
    vr: "FD",
    vm: "1",
    name: "StartRelativeDensityDifferenceThreshold"
  },
  "00189717": {
    tag: "(0018,9717)",
    vr: "FD",
    vm: "1",
    name: "StartCardiacTriggerCountThreshold"
  },
  "00189718": {
    tag: "(0018,9718)",
    vr: "FD",
    vm: "1",
    name: "StartRespiratoryTriggerCountThreshold"
  },
  "00189719": {
    tag: "(0018,9719)",
    vr: "FD",
    vm: "1",
    name: "TerminationCountsThreshold"
  },
  "00189720": {
    tag: "(0018,9720)",
    vr: "FD",
    vm: "1",
    name: "TerminationDensityThreshold"
  },
  "00189721": {
    tag: "(0018,9721)",
    vr: "FD",
    vm: "1",
    name: "TerminationRelativeDensityThreshold"
  },
  "00189722": {
    tag: "(0018,9722)",
    vr: "FD",
    vm: "1",
    name: "TerminationTimeThreshold"
  },
  "00189723": {
    tag: "(0018,9723)",
    vr: "FD",
    vm: "1",
    name: "TerminationCardiacTriggerCountThreshold"
  },
  "00189724": {
    tag: "(0018,9724)",
    vr: "FD",
    vm: "1",
    name: "TerminationRespiratoryTriggerCountThreshold"
  },
  "00189725": {
    tag: "(0018,9725)",
    vr: "CS",
    vm: "1",
    name: "DetectorGeometry"
  },
  "00189726": {
    tag: "(0018,9726)",
    vr: "FD",
    vm: "1",
    name: "TransverseDetectorSeparation"
  },
  "00189727": {
    tag: "(0018,9727)",
    vr: "FD",
    vm: "1",
    name: "AxialDetectorDimension"
  },
  "00189729": {
    tag: "(0018,9729)",
    vr: "US",
    vm: "1",
    name: "RadiopharmaceuticalAgentNumber"
  },
  "00189732": {
    tag: "(0018,9732)",
    vr: "SQ",
    vm: "1",
    name: "PETFrameAcquisitionSequence"
  },
  "00189733": {
    tag: "(0018,9733)",
    vr: "SQ",
    vm: "1",
    name: "PETDetectorMotionDetailsSequence"
  },
  "00189734": {
    tag: "(0018,9734)",
    vr: "SQ",
    vm: "1",
    name: "PETTableDynamicsSequence"
  },
  "00189735": {
    tag: "(0018,9735)",
    vr: "SQ",
    vm: "1",
    name: "PETPositionSequence"
  },
  "00189736": {
    tag: "(0018,9736)",
    vr: "SQ",
    vm: "1",
    name: "PETFrameCorrectionFactorsSequence"
  },
  "00189737": {
    tag: "(0018,9737)",
    vr: "SQ",
    vm: "1",
    name: "RadiopharmaceuticalUsageSequence"
  },
  "00189738": {
    tag: "(0018,9738)",
    vr: "CS",
    vm: "1",
    name: "AttenuationCorrectionSource"
  },
  "00189739": {
    tag: "(0018,9739)",
    vr: "US",
    vm: "1",
    name: "NumberOfIterations"
  },
  "00189740": {
    tag: "(0018,9740)",
    vr: "US",
    vm: "1",
    name: "NumberOfSubsets"
  },
  "00189749": {
    tag: "(0018,9749)",
    vr: "SQ",
    vm: "1",
    name: "PETReconstructionSequence"
  },
  "00189751": {
    tag: "(0018,9751)",
    vr: "SQ",
    vm: "1",
    name: "PETFrameTypeSequence"
  },
  "00189755": {
    tag: "(0018,9755)",
    vr: "CS",
    vm: "1",
    name: "TimeOfFlightInformationUsed"
  },
  "00189756": {
    tag: "(0018,9756)",
    vr: "CS",
    vm: "1",
    name: "ReconstructionType"
  },
  "00189758": {
    tag: "(0018,9758)",
    vr: "CS",
    vm: "1",
    name: "DecayCorrected"
  },
  "00189759": {
    tag: "(0018,9759)",
    vr: "CS",
    vm: "1",
    name: "AttenuationCorrected"
  },
  "00189760": {
    tag: "(0018,9760)",
    vr: "CS",
    vm: "1",
    name: "ScatterCorrected"
  },
  "00189761": {
    tag: "(0018,9761)",
    vr: "CS",
    vm: "1",
    name: "DeadTimeCorrected"
  },
  "00189762": {
    tag: "(0018,9762)",
    vr: "CS",
    vm: "1",
    name: "GantryMotionCorrected"
  },
  "00189763": {
    tag: "(0018,9763)",
    vr: "CS",
    vm: "1",
    name: "PatientMotionCorrected"
  },
  "00189764": {
    tag: "(0018,9764)",
    vr: "CS",
    vm: "1",
    name: "CountLossNormalizationCorrected"
  },
  "00189765": {
    tag: "(0018,9765)",
    vr: "CS",
    vm: "1",
    name: "RandomsCorrected"
  },
  "00189766": {
    tag: "(0018,9766)",
    vr: "CS",
    vm: "1",
    name: "NonUniformRadialSamplingCorrected"
  },
  "00189767": {
    tag: "(0018,9767)",
    vr: "CS",
    vm: "1",
    name: "SensitivityCalibrated"
  },
  "00189768": {
    tag: "(0018,9768)",
    vr: "CS",
    vm: "1",
    name: "DetectorNormalizationCorrection"
  },
  "00189769": {
    tag: "(0018,9769)",
    vr: "CS",
    vm: "1",
    name: "IterativeReconstructionMethod"
  },
  "00189770": {
    tag: "(0018,9770)",
    vr: "CS",
    vm: "1",
    name: "AttenuationCorrectionTemporalRelationship"
  },
  "00189771": {
    tag: "(0018,9771)",
    vr: "SQ",
    vm: "1",
    name: "PatientPhysiologicalStateSequence"
  },
  "00189772": {
    tag: "(0018,9772)",
    vr: "SQ",
    vm: "1",
    name: "PatientPhysiologicalStateCodeSequence"
  },
  "00189801": {
    tag: "(0018,9801)",
    vr: "FD",
    vm: "1-n",
    name: "DepthsOfFocus"
  },
  "00189803": {
    tag: "(0018,9803)",
    vr: "SQ",
    vm: "1",
    name: "ExcludedIntervalsSequence"
  },
  "00189804": {
    tag: "(0018,9804)",
    vr: "DT",
    vm: "1",
    name: "ExclusionStartDateTime"
  },
  "00189805": {
    tag: "(0018,9805)",
    vr: "FD",
    vm: "1",
    name: "ExclusionDuration"
  },
  "00189806": {
    tag: "(0018,9806)",
    vr: "SQ",
    vm: "1",
    name: "USImageDescriptionSequence"
  },
  "00189807": {
    tag: "(0018,9807)",
    vr: "SQ",
    vm: "1",
    name: "ImageDataTypeSequence"
  },
  "00189808": {
    tag: "(0018,9808)",
    vr: "CS",
    vm: "1",
    name: "DataType"
  },
  "00189809": {
    tag: "(0018,9809)",
    vr: "SQ",
    vm: "1",
    name: "TransducerScanPatternCodeSequence"
  },
  "0018980B": {
    tag: "(0018,980B)",
    vr: "CS",
    vm: "1",
    name: "AliasedDataType"
  },
  "0018980C": {
    tag: "(0018,980C)",
    vr: "CS",
    vm: "1",
    name: "PositionMeasuringDeviceUsed"
  },
  "0018980D": {
    tag: "(0018,980D)",
    vr: "SQ",
    vm: "1",
    name: "TransducerGeometryCodeSequence"
  },
  "0018980E": {
    tag: "(0018,980E)",
    vr: "SQ",
    vm: "1",
    name: "TransducerBeamSteeringCodeSequence"
  },
  "0018980F": {
    tag: "(0018,980F)",
    vr: "SQ",
    vm: "1",
    name: "TransducerApplicationCodeSequence"
  },
  "00189810": {
    tag: "(0018,9810)",
    vr: "US|SS",
    vm: "1",
    name: "ZeroVelocityPixelValue"
  },
  "00189900": {
    tag: "(0018,9900)",
    vr: "LO",
    vm: "1",
    name: "ReferenceLocationLabel"
  },
  "00189901": {
    tag: "(0018,9901)",
    vr: "UT",
    vm: "1",
    name: "ReferenceLocationDescription"
  },
  "00189902": {
    tag: "(0018,9902)",
    vr: "SQ",
    vm: "1",
    name: "ReferenceBasisCodeSequence"
  },
  "00189903": {
    tag: "(0018,9903)",
    vr: "SQ",
    vm: "1",
    name: "ReferenceGeometryCodeSequence"
  },
  "00189904": {
    tag: "(0018,9904)",
    vr: "DS",
    vm: "1",
    name: "OffsetDistance"
  },
  "00189905": {
    tag: "(0018,9905)",
    vr: "CS",
    vm: "1",
    name: "OffsetDirection"
  },
  "00189906": {
    tag: "(0018,9906)",
    vr: "SQ",
    vm: "1",
    name: "PotentialScheduledProtocolCodeSequence"
  },
  "00189907": {
    tag: "(0018,9907)",
    vr: "SQ",
    vm: "1",
    name: "PotentialRequestedProcedureCodeSequence"
  },
  "00189908": {
    tag: "(0018,9908)",
    vr: "UC",
    vm: "1-n",
    name: "PotentialReasonsForProcedure"
  },
  "00189909": {
    tag: "(0018,9909)",
    vr: "SQ",
    vm: "1",
    name: "PotentialReasonsForProcedureCodeSequence"
  },
  "0018990A": {
    tag: "(0018,990A)",
    vr: "UC",
    vm: "1-n",
    name: "PotentialDiagnosticTasks"
  },
  "0018990B": {
    tag: "(0018,990B)",
    vr: "SQ",
    vm: "1",
    name: "ContraindicationsCodeSequence"
  },
  "0018990C": {
    tag: "(0018,990C)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedDefinedProtocolSequence"
  },
  "0018990D": {
    tag: "(0018,990D)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPerformedProtocolSequence"
  },
  "0018990E": {
    tag: "(0018,990E)",
    vr: "SQ",
    vm: "1",
    name: "PredecessorProtocolSequence"
  },
  "0018990F": {
    tag: "(0018,990F)",
    vr: "UT",
    vm: "1",
    name: "ProtocolPlanningInformation"
  },
  "00189910": {
    tag: "(0018,9910)",
    vr: "UT",
    vm: "1",
    name: "ProtocolDesignRationale"
  },
  "00189911": {
    tag: "(0018,9911)",
    vr: "SQ",
    vm: "1",
    name: "PatientSpecificationSequence"
  },
  "00189912": {
    tag: "(0018,9912)",
    vr: "SQ",
    vm: "1",
    name: "ModelSpecificationSequence"
  },
  "00189913": {
    tag: "(0018,9913)",
    vr: "SQ",
    vm: "1",
    name: "ParametersSpecificationSequence"
  },
  "00189914": {
    tag: "(0018,9914)",
    vr: "SQ",
    vm: "1",
    name: "InstructionSequence"
  },
  "00189915": {
    tag: "(0018,9915)",
    vr: "US",
    vm: "1",
    name: "InstructionIndex"
  },
  "00189916": {
    tag: "(0018,9916)",
    vr: "LO",
    vm: "1",
    name: "InstructionText"
  },
  "00189917": {
    tag: "(0018,9917)",
    vr: "UT",
    vm: "1",
    name: "InstructionDescription"
  },
  "00189918": {
    tag: "(0018,9918)",
    vr: "CS",
    vm: "1",
    name: "InstructionPerformedFlag"
  },
  "00189919": {
    tag: "(0018,9919)",
    vr: "DT",
    vm: "1",
    name: "InstructionPerformedDateTime"
  },
  "0018991A": {
    tag: "(0018,991A)",
    vr: "UT",
    vm: "1",
    name: "InstructionPerformanceComment"
  },
  "0018991B": {
    tag: "(0018,991B)",
    vr: "SQ",
    vm: "1",
    name: "PatientPositioningInstructionSequence"
  },
  "0018991C": {
    tag: "(0018,991C)",
    vr: "SQ",
    vm: "1",
    name: "PositioningMethodCodeSequence"
  },
  "0018991D": {
    tag: "(0018,991D)",
    vr: "SQ",
    vm: "1",
    name: "PositioningLandmarkSequence"
  },
  "0018991E": {
    tag: "(0018,991E)",
    vr: "UI",
    vm: "1",
    name: "TargetFrameOfReferenceUID"
  },
  "0018991F": {
    tag: "(0018,991F)",
    vr: "SQ",
    vm: "1",
    name: "AcquisitionProtocolElementSpecificationSequence"
  },
  "00189920": {
    tag: "(0018,9920)",
    vr: "SQ",
    vm: "1",
    name: "AcquisitionProtocolElementSequence"
  },
  "00189921": {
    tag: "(0018,9921)",
    vr: "US",
    vm: "1",
    name: "ProtocolElementNumber"
  },
  "00189922": {
    tag: "(0018,9922)",
    vr: "LO",
    vm: "1",
    name: "ProtocolElementName"
  },
  "00189923": {
    tag: "(0018,9923)",
    vr: "UT",
    vm: "1",
    name: "ProtocolElementCharacteristicsSummary"
  },
  "00189924": {
    tag: "(0018,9924)",
    vr: "UT",
    vm: "1",
    name: "ProtocolElementPurpose"
  },
  "00189930": {
    tag: "(0018,9930)",
    vr: "CS",
    vm: "1",
    name: "AcquisitionMotion"
  },
  "00189931": {
    tag: "(0018,9931)",
    vr: "SQ",
    vm: "1",
    name: "AcquisitionStartLocationSequence"
  },
  "00189932": {
    tag: "(0018,9932)",
    vr: "SQ",
    vm: "1",
    name: "AcquisitionEndLocationSequence"
  },
  "00189933": {
    tag: "(0018,9933)",
    vr: "SQ",
    vm: "1",
    name: "ReconstructionProtocolElementSpecificationSequence"
  },
  "00189934": {
    tag: "(0018,9934)",
    vr: "SQ",
    vm: "1",
    name: "ReconstructionProtocolElementSequence"
  },
  "00189935": {
    tag: "(0018,9935)",
    vr: "SQ",
    vm: "1",
    name: "StorageProtocolElementSpecificationSequence"
  },
  "00189936": {
    tag: "(0018,9936)",
    vr: "SQ",
    vm: "1",
    name: "StorageProtocolElementSequence"
  },
  "00189937": {
    tag: "(0018,9937)",
    vr: "LO",
    vm: "1",
    name: "RequestedSeriesDescription"
  },
  "00189938": {
    tag: "(0018,9938)",
    vr: "US",
    vm: "1-n",
    name: "SourceAcquisitionProtocolElementNumber"
  },
  "00189939": {
    tag: "(0018,9939)",
    vr: "US",
    vm: "1-n",
    name: "SourceAcquisitionBeamNumber"
  },
  "0018993A": {
    tag: "(0018,993A)",
    vr: "US",
    vm: "1-n",
    name: "SourceReconstructionProtocolElementNumber"
  },
  "0018993B": {
    tag: "(0018,993B)",
    vr: "SQ",
    vm: "1",
    name: "ReconstructionStartLocationSequence"
  },
  "0018993C": {
    tag: "(0018,993C)",
    vr: "SQ",
    vm: "1",
    name: "ReconstructionEndLocationSequence"
  },
  "0018993D": {
    tag: "(0018,993D)",
    vr: "SQ",
    vm: "1",
    name: "ReconstructionAlgorithmSequence"
  },
  "0018993E": {
    tag: "(0018,993E)",
    vr: "SQ",
    vm: "1",
    name: "ReconstructionTargetCenterLocationSequence"
  },
  "00189941": {
    tag: "(0018,9941)",
    vr: "UT",
    vm: "1",
    name: "ImageFilterDescription"
  },
  "00189942": {
    tag: "(0018,9942)",
    vr: "FD",
    vm: "1",
    name: "CTDIvolNotificationTrigger"
  },
  "00189943": {
    tag: "(0018,9943)",
    vr: "FD",
    vm: "1",
    name: "DLPNotificationTrigger"
  },
  "00189944": {
    tag: "(0018,9944)",
    vr: "CS",
    vm: "1",
    name: "AutoKVPSelectionType"
  },
  "00189945": {
    tag: "(0018,9945)",
    vr: "FD",
    vm: "1",
    name: "AutoKVPUpperBound"
  },
  "00189946": {
    tag: "(0018,9946)",
    vr: "FD",
    vm: "1",
    name: "AutoKVPLowerBound"
  },
  "00189947": {
    tag: "(0018,9947)",
    vr: "CS",
    vm: "1",
    name: "ProtocolDefinedPatientPosition"
  },
  "0018A001": {
    tag: "(0018,A001)",
    vr: "SQ",
    vm: "1",
    name: "ContributingEquipmentSequence"
  },
  "0018A002": {
    tag: "(0018,A002)",
    vr: "DT",
    vm: "1",
    name: "ContributionDateTime"
  },
  "0018A003": {
    tag: "(0018,A003)",
    vr: "ST",
    vm: "1",
    name: "ContributionDescription"
  },
  "0020000D": {
    tag: "(0020,000D)",
    vr: "UI",
    vm: "1",
    name: "StudyInstanceUID"
  },
  "0020000E": {
    tag: "(0020,000E)",
    vr: "UI",
    vm: "1",
    name: "SeriesInstanceUID"
  },
  "00200010": {
    tag: "(0020,0010)",
    vr: "SH",
    vm: "1",
    name: "StudyID"
  },
  "00200011": {
    tag: "(0020,0011)",
    vr: "IS",
    vm: "1",
    name: "SeriesNumber"
  },
  "00200012": {
    tag: "(0020,0012)",
    vr: "IS",
    vm: "1",
    name: "AcquisitionNumber"
  },
  "00200013": {
    tag: "(0020,0013)",
    vr: "IS",
    vm: "1",
    name: "InstanceNumber"
  },
  "00200014": {
    tag: "(0020,0014)",
    vr: "IS",
    vm: "1",
    name: "IsotopeNumber"
  },
  "00200015": {
    tag: "(0020,0015)",
    vr: "IS",
    vm: "1",
    name: "PhaseNumber"
  },
  "00200016": {
    tag: "(0020,0016)",
    vr: "IS",
    vm: "1",
    name: "IntervalNumber"
  },
  "00200017": {
    tag: "(0020,0017)",
    vr: "IS",
    vm: "1",
    name: "TimeSlotNumber"
  },
  "00200018": {
    tag: "(0020,0018)",
    vr: "IS",
    vm: "1",
    name: "AngleNumber"
  },
  "00200019": {
    tag: "(0020,0019)",
    vr: "IS",
    vm: "1",
    name: "ItemNumber"
  },
  "00200020": {
    tag: "(0020,0020)",
    vr: "CS",
    vm: "2",
    name: "PatientOrientation"
  },
  "00200022": {
    tag: "(0020,0022)",
    vr: "IS",
    vm: "1",
    name: "OverlayNumber"
  },
  "00200024": {
    tag: "(0020,0024)",
    vr: "IS",
    vm: "1",
    name: "CurveNumber"
  },
  "00200026": {
    tag: "(0020,0026)",
    vr: "IS",
    vm: "1",
    name: "LUTNumber"
  },
  "00200030": {
    tag: "(0020,0030)",
    vr: "DS",
    vm: "3",
    name: "ImagePosition"
  },
  "00200032": {
    tag: "(0020,0032)",
    vr: "DS",
    vm: "3",
    name: "ImagePositionPatient"
  },
  "00200035": {
    tag: "(0020,0035)",
    vr: "DS",
    vm: "6",
    name: "ImageOrientation"
  },
  "00200037": {
    tag: "(0020,0037)",
    vr: "DS",
    vm: "6",
    name: "ImageOrientationPatient"
  },
  "00200050": {
    tag: "(0020,0050)",
    vr: "DS",
    vm: "1",
    name: "Location"
  },
  "00200052": {
    tag: "(0020,0052)",
    vr: "UI",
    vm: "1",
    name: "FrameOfReferenceUID"
  },
  "00200060": {
    tag: "(0020,0060)",
    vr: "CS",
    vm: "1",
    name: "Laterality"
  },
  "00200062": {
    tag: "(0020,0062)",
    vr: "CS",
    vm: "1",
    name: "ImageLaterality"
  },
  "00200070": {
    tag: "(0020,0070)",
    vr: "LO",
    vm: "1",
    name: "ImageGeometryType"
  },
  "00200080": {
    tag: "(0020,0080)",
    vr: "CS",
    vm: "1-n",
    name: "MaskingImage"
  },
  "002000AA": {
    tag: "(0020,00AA)",
    vr: "IS",
    vm: "1",
    name: "ReportNumber"
  },
  "00200100": {
    tag: "(0020,0100)",
    vr: "IS",
    vm: "1",
    name: "TemporalPositionIdentifier"
  },
  "00200105": {
    tag: "(0020,0105)",
    vr: "IS",
    vm: "1",
    name: "NumberOfTemporalPositions"
  },
  "00200110": {
    tag: "(0020,0110)",
    vr: "DS",
    vm: "1",
    name: "TemporalResolution"
  },
  "00200200": {
    tag: "(0020,0200)",
    vr: "UI",
    vm: "1",
    name: "SynchronizationFrameOfReferenceUID"
  },
  "00200242": {
    tag: "(0020,0242)",
    vr: "UI",
    vm: "1",
    name: "SOPInstanceUIDOfConcatenationSource"
  },
  "00201000": {
    tag: "(0020,1000)",
    vr: "IS",
    vm: "1",
    name: "SeriesInStudy"
  },
  "00201001": {
    tag: "(0020,1001)",
    vr: "IS",
    vm: "1",
    name: "AcquisitionsInSeries"
  },
  "00201002": {
    tag: "(0020,1002)",
    vr: "IS",
    vm: "1",
    name: "ImagesInAcquisition"
  },
  "00201003": {
    tag: "(0020,1003)",
    vr: "IS",
    vm: "1",
    name: "ImagesInSeries"
  },
  "00201004": {
    tag: "(0020,1004)",
    vr: "IS",
    vm: "1",
    name: "AcquisitionsInStudy"
  },
  "00201005": {
    tag: "(0020,1005)",
    vr: "IS",
    vm: "1",
    name: "ImagesInStudy"
  },
  "00201020": {
    tag: "(0020,1020)",
    vr: "LO",
    vm: "1-n",
    name: "Reference"
  },
  "0020103F": {
    tag: "(0020,103F)",
    vr: "LO",
    vm: "1",
    name: "TargetPositionReferenceIndicator"
  },
  "00201040": {
    tag: "(0020,1040)",
    vr: "LO",
    vm: "1",
    name: "PositionReferenceIndicator"
  },
  "00201041": {
    tag: "(0020,1041)",
    vr: "DS",
    vm: "1",
    name: "SliceLocation"
  },
  "00201070": {
    tag: "(0020,1070)",
    vr: "IS",
    vm: "1-n",
    name: "OtherStudyNumbers"
  },
  "00201200": {
    tag: "(0020,1200)",
    vr: "IS",
    vm: "1",
    name: "NumberOfPatientRelatedStudies"
  },
  "00201202": {
    tag: "(0020,1202)",
    vr: "IS",
    vm: "1",
    name: "NumberOfPatientRelatedSeries"
  },
  "00201204": {
    tag: "(0020,1204)",
    vr: "IS",
    vm: "1",
    name: "NumberOfPatientRelatedInstances"
  },
  "00201206": {
    tag: "(0020,1206)",
    vr: "IS",
    vm: "1",
    name: "NumberOfStudyRelatedSeries"
  },
  "00201208": {
    tag: "(0020,1208)",
    vr: "IS",
    vm: "1",
    name: "NumberOfStudyRelatedInstances"
  },
  "00201209": {
    tag: "(0020,1209)",
    vr: "IS",
    vm: "1",
    name: "NumberOfSeriesRelatedInstances"
  },
  "002031xx": {
    tag: "(0020,31xx)",
    vr: "CS",
    vm: "1-n",
    name: "SourceImageIDs"
  },
  "00203401": {
    tag: "(0020,3401)",
    vr: "CS",
    vm: "1",
    name: "ModifyingDeviceID"
  },
  "00203402": {
    tag: "(0020,3402)",
    vr: "CS",
    vm: "1",
    name: "ModifiedImageID"
  },
  "00203403": {
    tag: "(0020,3403)",
    vr: "DA",
    vm: "1",
    name: "ModifiedImageDate"
  },
  "00203404": {
    tag: "(0020,3404)",
    vr: "LO",
    vm: "1",
    name: "ModifyingDeviceManufacturer"
  },
  "00203405": {
    tag: "(0020,3405)",
    vr: "TM",
    vm: "1",
    name: "ModifiedImageTime"
  },
  "00203406": {
    tag: "(0020,3406)",
    vr: "LO",
    vm: "1",
    name: "ModifiedImageDescription"
  },
  "00204000": {
    tag: "(0020,4000)",
    vr: "LT",
    vm: "1",
    name: "ImageComments"
  },
  "00205000": {
    tag: "(0020,5000)",
    vr: "AT",
    vm: "1-n",
    name: "OriginalImageIdentification"
  },
  "00205002": {
    tag: "(0020,5002)",
    vr: "LO",
    vm: "1-n",
    name: "OriginalImageIdentificationNomenclature"
  },
  "00209056": {
    tag: "(0020,9056)",
    vr: "SH",
    vm: "1",
    name: "StackID"
  },
  "00209057": {
    tag: "(0020,9057)",
    vr: "UL",
    vm: "1",
    name: "InStackPositionNumber"
  },
  "00209071": {
    tag: "(0020,9071)",
    vr: "SQ",
    vm: "1",
    name: "FrameAnatomySequence"
  },
  "00209072": {
    tag: "(0020,9072)",
    vr: "CS",
    vm: "1",
    name: "FrameLaterality"
  },
  "00209111": {
    tag: "(0020,9111)",
    vr: "SQ",
    vm: "1",
    name: "FrameContentSequence"
  },
  "00209113": {
    tag: "(0020,9113)",
    vr: "SQ",
    vm: "1",
    name: "PlanePositionSequence"
  },
  "00209116": {
    tag: "(0020,9116)",
    vr: "SQ",
    vm: "1",
    name: "PlaneOrientationSequence"
  },
  "00209128": {
    tag: "(0020,9128)",
    vr: "UL",
    vm: "1",
    name: "TemporalPositionIndex"
  },
  "00209153": {
    tag: "(0020,9153)",
    vr: "FD",
    vm: "1",
    name: "NominalCardiacTriggerDelayTime"
  },
  "00209154": {
    tag: "(0020,9154)",
    vr: "FL",
    vm: "1",
    name: "NominalCardiacTriggerTimePriorToRPeak"
  },
  "00209155": {
    tag: "(0020,9155)",
    vr: "FL",
    vm: "1",
    name: "ActualCardiacTriggerTimePriorToRPeak"
  },
  "00209156": {
    tag: "(0020,9156)",
    vr: "US",
    vm: "1",
    name: "FrameAcquisitionNumber"
  },
  "00209157": {
    tag: "(0020,9157)",
    vr: "UL",
    vm: "1-n",
    name: "DimensionIndexValues"
  },
  "00209158": {
    tag: "(0020,9158)",
    vr: "LT",
    vm: "1",
    name: "FrameComments"
  },
  "00209161": {
    tag: "(0020,9161)",
    vr: "UI",
    vm: "1",
    name: "ConcatenationUID"
  },
  "00209162": {
    tag: "(0020,9162)",
    vr: "US",
    vm: "1",
    name: "InConcatenationNumber"
  },
  "00209163": {
    tag: "(0020,9163)",
    vr: "US",
    vm: "1",
    name: "InConcatenationTotalNumber"
  },
  "00209164": {
    tag: "(0020,9164)",
    vr: "UI",
    vm: "1",
    name: "DimensionOrganizationUID"
  },
  "00209165": {
    tag: "(0020,9165)",
    vr: "AT",
    vm: "1",
    name: "DimensionIndexPointer"
  },
  "00209167": {
    tag: "(0020,9167)",
    vr: "AT",
    vm: "1",
    name: "FunctionalGroupPointer"
  },
  "00209170": {
    tag: "(0020,9170)",
    vr: "SQ",
    vm: "1",
    name: "UnassignedSharedConvertedAttributesSequence"
  },
  "00209171": {
    tag: "(0020,9171)",
    vr: "SQ",
    vm: "1",
    name: "UnassignedPerFrameConvertedAttributesSequence"
  },
  "00209172": {
    tag: "(0020,9172)",
    vr: "SQ",
    vm: "1",
    name: "ConversionSourceAttributesSequence"
  },
  "00209213": {
    tag: "(0020,9213)",
    vr: "LO",
    vm: "1",
    name: "DimensionIndexPrivateCreator"
  },
  "00209221": {
    tag: "(0020,9221)",
    vr: "SQ",
    vm: "1",
    name: "DimensionOrganizationSequence"
  },
  "00209222": {
    tag: "(0020,9222)",
    vr: "SQ",
    vm: "1",
    name: "DimensionIndexSequence"
  },
  "00209228": {
    tag: "(0020,9228)",
    vr: "UL",
    vm: "1",
    name: "ConcatenationFrameOffsetNumber"
  },
  "00209238": {
    tag: "(0020,9238)",
    vr: "LO",
    vm: "1",
    name: "FunctionalGroupPrivateCreator"
  },
  "00209241": {
    tag: "(0020,9241)",
    vr: "FL",
    vm: "1",
    name: "NominalPercentageOfCardiacPhase"
  },
  "00209245": {
    tag: "(0020,9245)",
    vr: "FL",
    vm: "1",
    name: "NominalPercentageOfRespiratoryPhase"
  },
  "00209246": {
    tag: "(0020,9246)",
    vr: "FL",
    vm: "1",
    name: "StartingRespiratoryAmplitude"
  },
  "00209247": {
    tag: "(0020,9247)",
    vr: "CS",
    vm: "1",
    name: "StartingRespiratoryPhase"
  },
  "00209248": {
    tag: "(0020,9248)",
    vr: "FL",
    vm: "1",
    name: "EndingRespiratoryAmplitude"
  },
  "00209249": {
    tag: "(0020,9249)",
    vr: "CS",
    vm: "1",
    name: "EndingRespiratoryPhase"
  },
  "00209250": {
    tag: "(0020,9250)",
    vr: "CS",
    vm: "1",
    name: "RespiratoryTriggerType"
  },
  "00209251": {
    tag: "(0020,9251)",
    vr: "FD",
    vm: "1",
    name: "RRIntervalTimeNominal"
  },
  "00209252": {
    tag: "(0020,9252)",
    vr: "FD",
    vm: "1",
    name: "ActualCardiacTriggerDelayTime"
  },
  "00209253": {
    tag: "(0020,9253)",
    vr: "SQ",
    vm: "1",
    name: "RespiratorySynchronizationSequence"
  },
  "00209254": {
    tag: "(0020,9254)",
    vr: "FD",
    vm: "1",
    name: "RespiratoryIntervalTime"
  },
  "00209255": {
    tag: "(0020,9255)",
    vr: "FD",
    vm: "1",
    name: "NominalRespiratoryTriggerDelayTime"
  },
  "00209256": {
    tag: "(0020,9256)",
    vr: "FD",
    vm: "1",
    name: "RespiratoryTriggerDelayThreshold"
  },
  "00209257": {
    tag: "(0020,9257)",
    vr: "FD",
    vm: "1",
    name: "ActualRespiratoryTriggerDelayTime"
  },
  "00209301": {
    tag: "(0020,9301)",
    vr: "FD",
    vm: "3",
    name: "ImagePositionVolume"
  },
  "00209302": {
    tag: "(0020,9302)",
    vr: "FD",
    vm: "6",
    name: "ImageOrientationVolume"
  },
  "00209307": {
    tag: "(0020,9307)",
    vr: "CS",
    vm: "1",
    name: "UltrasoundAcquisitionGeometry"
  },
  "00209308": {
    tag: "(0020,9308)",
    vr: "FD",
    vm: "3",
    name: "ApexPosition"
  },
  "00209309": {
    tag: "(0020,9309)",
    vr: "FD",
    vm: "16",
    name: "VolumeToTransducerMappingMatrix"
  },
  "0020930A": {
    tag: "(0020,930A)",
    vr: "FD",
    vm: "16",
    name: "VolumeToTableMappingMatrix"
  },
  "0020930B": {
    tag: "(0020,930B)",
    vr: "CS",
    vm: "1",
    name: "VolumeToTransducerRelationship"
  },
  "0020930C": {
    tag: "(0020,930C)",
    vr: "CS",
    vm: "1",
    name: "PatientFrameOfReferenceSource"
  },
  "0020930D": {
    tag: "(0020,930D)",
    vr: "FD",
    vm: "1",
    name: "TemporalPositionTimeOffset"
  },
  "0020930E": {
    tag: "(0020,930E)",
    vr: "SQ",
    vm: "1",
    name: "PlanePositionVolumeSequence"
  },
  "0020930F": {
    tag: "(0020,930F)",
    vr: "SQ",
    vm: "1",
    name: "PlaneOrientationVolumeSequence"
  },
  "00209310": {
    tag: "(0020,9310)",
    vr: "SQ",
    vm: "1",
    name: "TemporalPositionSequence"
  },
  "00209311": {
    tag: "(0020,9311)",
    vr: "CS",
    vm: "1",
    name: "DimensionOrganizationType"
  },
  "00209312": {
    tag: "(0020,9312)",
    vr: "UI",
    vm: "1",
    name: "VolumeFrameOfReferenceUID"
  },
  "00209313": {
    tag: "(0020,9313)",
    vr: "UI",
    vm: "1",
    name: "TableFrameOfReferenceUID"
  },
  "00209421": {
    tag: "(0020,9421)",
    vr: "LO",
    vm: "1",
    name: "DimensionDescriptionLabel"
  },
  "00209450": {
    tag: "(0020,9450)",
    vr: "SQ",
    vm: "1",
    name: "PatientOrientationInFrameSequence"
  },
  "00209453": {
    tag: "(0020,9453)",
    vr: "LO",
    vm: "1",
    name: "FrameLabel"
  },
  "00209518": {
    tag: "(0020,9518)",
    vr: "US",
    vm: "1-n",
    name: "AcquisitionIndex"
  },
  "00209529": {
    tag: "(0020,9529)",
    vr: "SQ",
    vm: "1",
    name: "ContributingSOPInstancesReferenceSequence"
  },
  "00209536": {
    tag: "(0020,9536)",
    vr: "US",
    vm: "1",
    name: "ReconstructionIndex"
  },
  "00220001": {
    tag: "(0022,0001)",
    vr: "US",
    vm: "1",
    name: "LightPathFilterPassThroughWavelength"
  },
  "00220002": {
    tag: "(0022,0002)",
    vr: "US",
    vm: "2",
    name: "LightPathFilterPassBand"
  },
  "00220003": {
    tag: "(0022,0003)",
    vr: "US",
    vm: "1",
    name: "ImagePathFilterPassThroughWavelength"
  },
  "00220004": {
    tag: "(0022,0004)",
    vr: "US",
    vm: "2",
    name: "ImagePathFilterPassBand"
  },
  "00220005": {
    tag: "(0022,0005)",
    vr: "CS",
    vm: "1",
    name: "PatientEyeMovementCommanded"
  },
  "00220006": {
    tag: "(0022,0006)",
    vr: "SQ",
    vm: "1",
    name: "PatientEyeMovementCommandCodeSequence"
  },
  "00220007": {
    tag: "(0022,0007)",
    vr: "FL",
    vm: "1",
    name: "SphericalLensPower"
  },
  "00220008": {
    tag: "(0022,0008)",
    vr: "FL",
    vm: "1",
    name: "CylinderLensPower"
  },
  "00220009": {
    tag: "(0022,0009)",
    vr: "FL",
    vm: "1",
    name: "CylinderAxis"
  },
  "0022000A": {
    tag: "(0022,000A)",
    vr: "FL",
    vm: "1",
    name: "EmmetropicMagnification"
  },
  "0022000B": {
    tag: "(0022,000B)",
    vr: "FL",
    vm: "1",
    name: "IntraOcularPressure"
  },
  "0022000C": {
    tag: "(0022,000C)",
    vr: "FL",
    vm: "1",
    name: "HorizontalFieldOfView"
  },
  "0022000D": {
    tag: "(0022,000D)",
    vr: "CS",
    vm: "1",
    name: "PupilDilated"
  },
  "0022000E": {
    tag: "(0022,000E)",
    vr: "FL",
    vm: "1",
    name: "DegreeOfDilation"
  },
  "00220010": {
    tag: "(0022,0010)",
    vr: "FL",
    vm: "1",
    name: "StereoBaselineAngle"
  },
  "00220011": {
    tag: "(0022,0011)",
    vr: "FL",
    vm: "1",
    name: "StereoBaselineDisplacement"
  },
  "00220012": {
    tag: "(0022,0012)",
    vr: "FL",
    vm: "1",
    name: "StereoHorizontalPixelOffset"
  },
  "00220013": {
    tag: "(0022,0013)",
    vr: "FL",
    vm: "1",
    name: "StereoVerticalPixelOffset"
  },
  "00220014": {
    tag: "(0022,0014)",
    vr: "FL",
    vm: "1",
    name: "StereoRotation"
  },
  "00220015": {
    tag: "(0022,0015)",
    vr: "SQ",
    vm: "1",
    name: "AcquisitionDeviceTypeCodeSequence"
  },
  "00220016": {
    tag: "(0022,0016)",
    vr: "SQ",
    vm: "1",
    name: "IlluminationTypeCodeSequence"
  },
  "00220017": {
    tag: "(0022,0017)",
    vr: "SQ",
    vm: "1",
    name: "LightPathFilterTypeStackCodeSequence"
  },
  "00220018": {
    tag: "(0022,0018)",
    vr: "SQ",
    vm: "1",
    name: "ImagePathFilterTypeStackCodeSequence"
  },
  "00220019": {
    tag: "(0022,0019)",
    vr: "SQ",
    vm: "1",
    name: "LensesCodeSequence"
  },
  "0022001A": {
    tag: "(0022,001A)",
    vr: "SQ",
    vm: "1",
    name: "ChannelDescriptionCodeSequence"
  },
  "0022001B": {
    tag: "(0022,001B)",
    vr: "SQ",
    vm: "1",
    name: "RefractiveStateSequence"
  },
  "0022001C": {
    tag: "(0022,001C)",
    vr: "SQ",
    vm: "1",
    name: "MydriaticAgentCodeSequence"
  },
  "0022001D": {
    tag: "(0022,001D)",
    vr: "SQ",
    vm: "1",
    name: "RelativeImagePositionCodeSequence"
  },
  "0022001E": {
    tag: "(0022,001E)",
    vr: "FL",
    vm: "1",
    name: "CameraAngleOfView"
  },
  "00220020": {
    tag: "(0022,0020)",
    vr: "SQ",
    vm: "1",
    name: "StereoPairsSequence"
  },
  "00220021": {
    tag: "(0022,0021)",
    vr: "SQ",
    vm: "1",
    name: "LeftImageSequence"
  },
  "00220022": {
    tag: "(0022,0022)",
    vr: "SQ",
    vm: "1",
    name: "RightImageSequence"
  },
  "00220028": {
    tag: "(0022,0028)",
    vr: "CS",
    vm: "1",
    name: "StereoPairsPresent"
  },
  "00220030": {
    tag: "(0022,0030)",
    vr: "FL",
    vm: "1",
    name: "AxialLengthOfTheEye"
  },
  "00220031": {
    tag: "(0022,0031)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicFrameLocationSequence"
  },
  "00220032": {
    tag: "(0022,0032)",
    vr: "FL",
    vm: "2-2n",
    name: "ReferenceCoordinates"
  },
  "00220035": {
    tag: "(0022,0035)",
    vr: "FL",
    vm: "1",
    name: "DepthSpatialResolution"
  },
  "00220036": {
    tag: "(0022,0036)",
    vr: "FL",
    vm: "1",
    name: "MaximumDepthDistortion"
  },
  "00220037": {
    tag: "(0022,0037)",
    vr: "FL",
    vm: "1",
    name: "AlongScanSpatialResolution"
  },
  "00220038": {
    tag: "(0022,0038)",
    vr: "FL",
    vm: "1",
    name: "MaximumAlongScanDistortion"
  },
  "00220039": {
    tag: "(0022,0039)",
    vr: "CS",
    vm: "1",
    name: "OphthalmicImageOrientation"
  },
  "00220041": {
    tag: "(0022,0041)",
    vr: "FL",
    vm: "1",
    name: "DepthOfTransverseImage"
  },
  "00220042": {
    tag: "(0022,0042)",
    vr: "SQ",
    vm: "1",
    name: "MydriaticAgentConcentrationUnitsSequence"
  },
  "00220048": {
    tag: "(0022,0048)",
    vr: "FL",
    vm: "1",
    name: "AcrossScanSpatialResolution"
  },
  "00220049": {
    tag: "(0022,0049)",
    vr: "FL",
    vm: "1",
    name: "MaximumAcrossScanDistortion"
  },
  "0022004E": {
    tag: "(0022,004E)",
    vr: "DS",
    vm: "1",
    name: "MydriaticAgentConcentration"
  },
  "00220055": {
    tag: "(0022,0055)",
    vr: "FL",
    vm: "1",
    name: "IlluminationWaveLength"
  },
  "00220056": {
    tag: "(0022,0056)",
    vr: "FL",
    vm: "1",
    name: "IlluminationPower"
  },
  "00220057": {
    tag: "(0022,0057)",
    vr: "FL",
    vm: "1",
    name: "IlluminationBandwidth"
  },
  "00220058": {
    tag: "(0022,0058)",
    vr: "SQ",
    vm: "1",
    name: "MydriaticAgentSequence"
  },
  "00221007": {
    tag: "(0022,1007)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialMeasurementsRightEyeSequence"
  },
  "00221008": {
    tag: "(0022,1008)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialMeasurementsLeftEyeSequence"
  },
  "00221009": {
    tag: "(0022,1009)",
    vr: "CS",
    vm: "1",
    name: "OphthalmicAxialMeasurementsDeviceType"
  },
  "00221010": {
    tag: "(0022,1010)",
    vr: "CS",
    vm: "1",
    name: "OphthalmicAxialLengthMeasurementsType"
  },
  "00221012": {
    tag: "(0022,1012)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthSequence"
  },
  "00221019": {
    tag: "(0022,1019)",
    vr: "FL",
    vm: "1",
    name: "OphthalmicAxialLength"
  },
  "00221024": {
    tag: "(0022,1024)",
    vr: "SQ",
    vm: "1",
    name: "LensStatusCodeSequence"
  },
  "00221025": {
    tag: "(0022,1025)",
    vr: "SQ",
    vm: "1",
    name: "VitreousStatusCodeSequence"
  },
  "00221028": {
    tag: "(0022,1028)",
    vr: "SQ",
    vm: "1",
    name: "IOLFormulaCodeSequence"
  },
  "00221029": {
    tag: "(0022,1029)",
    vr: "LO",
    vm: "1",
    name: "IOLFormulaDetail"
  },
  "00221033": {
    tag: "(0022,1033)",
    vr: "FL",
    vm: "1",
    name: "KeratometerIndex"
  },
  "00221035": {
    tag: "(0022,1035)",
    vr: "SQ",
    vm: "1",
    name: "SourceOfOphthalmicAxialLengthCodeSequence"
  },
  "00221037": {
    tag: "(0022,1037)",
    vr: "FL",
    vm: "1",
    name: "TargetRefraction"
  },
  "00221039": {
    tag: "(0022,1039)",
    vr: "CS",
    vm: "1",
    name: "RefractiveProcedureOccurred"
  },
  "00221040": {
    tag: "(0022,1040)",
    vr: "SQ",
    vm: "1",
    name: "RefractiveSurgeryTypeCodeSequence"
  },
  "00221044": {
    tag: "(0022,1044)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicUltrasoundMethodCodeSequence"
  },
  "00221050": {
    tag: "(0022,1050)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthMeasurementsSequence"
  },
  "00221053": {
    tag: "(0022,1053)",
    vr: "FL",
    vm: "1",
    name: "IOLPower"
  },
  "00221054": {
    tag: "(0022,1054)",
    vr: "FL",
    vm: "1",
    name: "PredictedRefractiveError"
  },
  "00221059": {
    tag: "(0022,1059)",
    vr: "FL",
    vm: "1",
    name: "OphthalmicAxialLengthVelocity"
  },
  "00221065": {
    tag: "(0022,1065)",
    vr: "LO",
    vm: "1",
    name: "LensStatusDescription"
  },
  "00221066": {
    tag: "(0022,1066)",
    vr: "LO",
    vm: "1",
    name: "VitreousStatusDescription"
  },
  "00221090": {
    tag: "(0022,1090)",
    vr: "SQ",
    vm: "1",
    name: "IOLPowerSequence"
  },
  "00221092": {
    tag: "(0022,1092)",
    vr: "SQ",
    vm: "1",
    name: "LensConstantSequence"
  },
  "00221093": {
    tag: "(0022,1093)",
    vr: "LO",
    vm: "1",
    name: "IOLManufacturer"
  },
  "00221094": {
    tag: "(0022,1094)",
    vr: "LO",
    vm: "1",
    name: "LensConstantDescription"
  },
  "00221095": {
    tag: "(0022,1095)",
    vr: "LO",
    vm: "1",
    name: "ImplantName"
  },
  "00221096": {
    tag: "(0022,1096)",
    vr: "SQ",
    vm: "1",
    name: "KeratometryMeasurementTypeCodeSequence"
  },
  "00221097": {
    tag: "(0022,1097)",
    vr: "LO",
    vm: "1",
    name: "ImplantPartNumber"
  },
  "00221100": {
    tag: "(0022,1100)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedOphthalmicAxialMeasurementsSequence"
  },
  "00221101": {
    tag: "(0022,1101)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthMeasurementsSegmentNameCodeSequence"
  },
  "00221103": {
    tag: "(0022,1103)",
    vr: "SQ",
    vm: "1",
    name: "RefractiveErrorBeforeRefractiveSurgeryCodeSequence"
  },
  "00221121": {
    tag: "(0022,1121)",
    vr: "FL",
    vm: "1",
    name: "IOLPowerForExactEmmetropia"
  },
  "00221122": {
    tag: "(0022,1122)",
    vr: "FL",
    vm: "1",
    name: "IOLPowerForExactTargetRefraction"
  },
  "00221125": {
    tag: "(0022,1125)",
    vr: "SQ",
    vm: "1",
    name: "AnteriorChamberDepthDefinitionCodeSequence"
  },
  "00221127": {
    tag: "(0022,1127)",
    vr: "SQ",
    vm: "1",
    name: "LensThicknessSequence"
  },
  "00221128": {
    tag: "(0022,1128)",
    vr: "SQ",
    vm: "1",
    name: "AnteriorChamberDepthSequence"
  },
  "00221130": {
    tag: "(0022,1130)",
    vr: "FL",
    vm: "1",
    name: "LensThickness"
  },
  "00221131": {
    tag: "(0022,1131)",
    vr: "FL",
    vm: "1",
    name: "AnteriorChamberDepth"
  },
  "00221132": {
    tag: "(0022,1132)",
    vr: "SQ",
    vm: "1",
    name: "SourceOfLensThicknessDataCodeSequence"
  },
  "00221133": {
    tag: "(0022,1133)",
    vr: "SQ",
    vm: "1",
    name: "SourceOfAnteriorChamberDepthDataCodeSequence"
  },
  "00221134": {
    tag: "(0022,1134)",
    vr: "SQ",
    vm: "1",
    name: "SourceOfRefractiveMeasurementsSequence"
  },
  "00221135": {
    tag: "(0022,1135)",
    vr: "SQ",
    vm: "1",
    name: "SourceOfRefractiveMeasurementsCodeSequence"
  },
  "00221140": {
    tag: "(0022,1140)",
    vr: "CS",
    vm: "1",
    name: "OphthalmicAxialLengthMeasurementModified"
  },
  "00221150": {
    tag: "(0022,1150)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthDataSourceCodeSequence"
  },
  "00221153": {
    tag: "(0022,1153)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthAcquisitionMethodCodeSequence"
  },
  "00221155": {
    tag: "(0022,1155)",
    vr: "FL",
    vm: "1",
    name: "SignalToNoiseRatio"
  },
  "00221159": {
    tag: "(0022,1159)",
    vr: "LO",
    vm: "1",
    name: "OphthalmicAxialLengthDataSourceDescription"
  },
  "00221210": {
    tag: "(0022,1210)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthMeasurementsTotalLengthSequence"
  },
  "00221211": {
    tag: "(0022,1211)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthMeasurementsSegmentalLengthSequence"
  },
  "00221212": {
    tag: "(0022,1212)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthMeasurementsLengthSummationSequence"
  },
  "00221220": {
    tag: "(0022,1220)",
    vr: "SQ",
    vm: "1",
    name: "UltrasoundOphthalmicAxialLengthMeasurementsSequence"
  },
  "00221225": {
    tag: "(0022,1225)",
    vr: "SQ",
    vm: "1",
    name: "OpticalOphthalmicAxialLengthMeasurementsSequence"
  },
  "00221230": {
    tag: "(0022,1230)",
    vr: "SQ",
    vm: "1",
    name: "UltrasoundSelectedOphthalmicAxialLengthSequence"
  },
  "00221250": {
    tag: "(0022,1250)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthSelectionMethodCodeSequence"
  },
  "00221255": {
    tag: "(0022,1255)",
    vr: "SQ",
    vm: "1",
    name: "OpticalSelectedOphthalmicAxialLengthSequence"
  },
  "00221257": {
    tag: "(0022,1257)",
    vr: "SQ",
    vm: "1",
    name: "SelectedSegmentalOphthalmicAxialLengthSequence"
  },
  "00221260": {
    tag: "(0022,1260)",
    vr: "SQ",
    vm: "1",
    name: "SelectedTotalOphthalmicAxialLengthSequence"
  },
  "00221262": {
    tag: "(0022,1262)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthQualityMetricSequence"
  },
  "00221265": {
    tag: "(0022,1265)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicAxialLengthQualityMetricTypeCodeSequence"
  },
  "00221273": {
    tag: "(0022,1273)",
    vr: "LO",
    vm: "1",
    name: "OphthalmicAxialLengthQualityMetricTypeDescription"
  },
  "00221300": {
    tag: "(0022,1300)",
    vr: "SQ",
    vm: "1",
    name: "IntraocularLensCalculationsRightEyeSequence"
  },
  "00221310": {
    tag: "(0022,1310)",
    vr: "SQ",
    vm: "1",
    name: "IntraocularLensCalculationsLeftEyeSequence"
  },
  "00221330": {
    tag: "(0022,1330)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedOphthalmicAxialLengthMeasurementQCImageSequence"
  },
  "00221415": {
    tag: "(0022,1415)",
    vr: "CS",
    vm: "1",
    name: "OphthalmicMappingDeviceType"
  },
  "00221420": {
    tag: "(0022,1420)",
    vr: "SQ",
    vm: "1",
    name: "AcquisitionMethodCodeSequence"
  },
  "00221423": {
    tag: "(0022,1423)",
    vr: "SQ",
    vm: "1",
    name: "AcquisitionMethodAlgorithmSequence"
  },
  "00221436": {
    tag: "(0022,1436)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicThicknessMapTypeCodeSequence"
  },
  "00221443": {
    tag: "(0022,1443)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicThicknessMappingNormalsSequence"
  },
  "00221445": {
    tag: "(0022,1445)",
    vr: "SQ",
    vm: "1",
    name: "RetinalThicknessDefinitionCodeSequence"
  },
  "00221450": {
    tag: "(0022,1450)",
    vr: "SQ",
    vm: "1",
    name: "PixelValueMappingToCodedConceptSequence"
  },
  "00221452": {
    tag: "(0022,1452)",
    vr: "US|SS",
    vm: "1",
    name: "MappedPixelValue"
  },
  "00221454": {
    tag: "(0022,1454)",
    vr: "LO",
    vm: "1",
    name: "PixelValueMappingExplanation"
  },
  "00221458": {
    tag: "(0022,1458)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicThicknessMapQualityThresholdSequence"
  },
  "00221460": {
    tag: "(0022,1460)",
    vr: "FL",
    vm: "1",
    name: "OphthalmicThicknessMapThresholdQualityRating"
  },
  "00221463": {
    tag: "(0022,1463)",
    vr: "FL",
    vm: "2",
    name: "AnatomicStructureReferencePoint"
  },
  "00221465": {
    tag: "(0022,1465)",
    vr: "SQ",
    vm: "1",
    name: "RegistrationToLocalizerSequence"
  },
  "00221466": {
    tag: "(0022,1466)",
    vr: "CS",
    vm: "1",
    name: "RegisteredLocalizerUnits"
  },
  "00221467": {
    tag: "(0022,1467)",
    vr: "FL",
    vm: "2",
    name: "RegisteredLocalizerTopLeftHandCorner"
  },
  "00221468": {
    tag: "(0022,1468)",
    vr: "FL",
    vm: "2",
    name: "RegisteredLocalizerBottomRightHandCorner"
  },
  "00221470": {
    tag: "(0022,1470)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicThicknessMapQualityRatingSequence"
  },
  "00221472": {
    tag: "(0022,1472)",
    vr: "SQ",
    vm: "1",
    name: "RelevantOPTAttributesSequence"
  },
  "00221512": {
    tag: "(0022,1512)",
    vr: "SQ",
    vm: "1",
    name: "TransformationMethodCodeSequence"
  },
  "00221513": {
    tag: "(0022,1513)",
    vr: "SQ",
    vm: "1",
    name: "TransformationAlgorithmSequence"
  },
  "00221515": {
    tag: "(0022,1515)",
    vr: "CS",
    vm: "1",
    name: "OphthalmicAxialLengthMethod"
  },
  "00221517": {
    tag: "(0022,1517)",
    vr: "FL",
    vm: "1",
    name: "OphthalmicFOV"
  },
  "00221518": {
    tag: "(0022,1518)",
    vr: "SQ",
    vm: "1",
    name: "TwoDimensionalToThreeDimensionalMapSequence"
  },
  "00221525": {
    tag: "(0022,1525)",
    vr: "SQ",
    vm: "1",
    name: "WideFieldOphthalmicPhotographyQualityRatingSequence"
  },
  "00221526": {
    tag: "(0022,1526)",
    vr: "SQ",
    vm: "1",
    name: "WideFieldOphthalmicPhotographyQualityThresholdSequence"
  },
  "00221527": {
    tag: "(0022,1527)",
    vr: "FL",
    vm: "1",
    name: "WideFieldOphthalmicPhotographyThresholdQualityRating"
  },
  "00221528": {
    tag: "(0022,1528)",
    vr: "FL",
    vm: "1",
    name: "XCoordinatesCenterPixelViewAngle"
  },
  "00221529": {
    tag: "(0022,1529)",
    vr: "FL",
    vm: "1",
    name: "YCoordinatesCenterPixelViewAngle"
  },
  "00221530": {
    tag: "(0022,1530)",
    vr: "UL",
    vm: "1",
    name: "NumberOfMapPoints"
  },
  "00221531": {
    tag: "(0022,1531)",
    vr: "OF",
    vm: "1",
    name: "TwoDimensionalToThreeDimensionalMapData"
  },
  "00221612": {
    tag: "(0022,1612)",
    vr: "SQ",
    vm: "1",
    name: "DerivationAlgorithmSequence"
  },
  "00221615": {
    tag: "(0022,1615)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicImageTypeCodeSequence"
  },
  "00221616": {
    tag: "(0022,1616)",
    vr: "LO",
    vm: "1",
    name: "OphthalmicImageTypeDescription"
  },
  "00221618": {
    tag: "(0022,1618)",
    vr: "SQ",
    vm: "1",
    name: "ScanPatternTypeCodeSequence"
  },
  "00221620": {
    tag: "(0022,1620)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedSurfaceMeshIdentificationSequence"
  },
  "00221622": {
    tag: "(0022,1622)",
    vr: "CS",
    vm: "1",
    name: "OphthalmicVolumetricPropertiesFlag"
  },
  "00221624": {
    tag: "(0022,1624)",
    vr: "FL",
    vm: "1",
    name: "OphthalmicAnatomicReferencePointXCoordinate"
  },
  "00221626": {
    tag: "(0022,1626)",
    vr: "FL",
    vm: "1",
    name: "OphthalmicAnatomicReferencePointYCoordinate"
  },
  "00221628": {
    tag: "(0022,1628)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicEnFaceImageQualityRatingSequence"
  },
  "00221630": {
    tag: "(0022,1630)",
    vr: "DS",
    vm: "1",
    name: "QualityThreshold"
  },
  "00221640": {
    tag: "(0022,1640)",
    vr: "SQ",
    vm: "1",
    name: "OCTBscanAnalysisAcquisitionParametersSequence"
  },
  "00221642": {
    tag: "(0022,1642)",
    vr: "UL",
    vm: "1",
    name: "NumberofBscansPerFrame"
  },
  "00221643": {
    tag: "(0022,1643)",
    vr: "FL",
    vm: "1",
    name: "BscanSlabThickness"
  },
  "00221644": {
    tag: "(0022,1644)",
    vr: "FL",
    vm: "1",
    name: "DistanceBetweenBscanSlabs"
  },
  "00221645": {
    tag: "(0022,1645)",
    vr: "FL",
    vm: "1",
    name: "BscanCycleTime"
  },
  "00221646": {
    tag: "(0022,1646)",
    vr: "FL",
    vm: "1-n",
    name: "BscanCycleTimeVector"
  },
  "00221649": {
    tag: "(0022,1649)",
    vr: "FL",
    vm: "1",
    name: "AscanRate"
  },
  "00221650": {
    tag: "(0022,1650)",
    vr: "FL",
    vm: "1",
    name: "BscanRate"
  },
  "00221658": {
    tag: "(0022,1658)",
    vr: "UL",
    vm: "1",
    name: "SurfaceMeshZPixelOffset"
  },
  "00240010": {
    tag: "(0024,0010)",
    vr: "FL",
    vm: "1",
    name: "VisualFieldHorizontalExtent"
  },
  "00240011": {
    tag: "(0024,0011)",
    vr: "FL",
    vm: "1",
    name: "VisualFieldVerticalExtent"
  },
  "00240012": {
    tag: "(0024,0012)",
    vr: "CS",
    vm: "1",
    name: "VisualFieldShape"
  },
  "00240016": {
    tag: "(0024,0016)",
    vr: "SQ",
    vm: "1",
    name: "ScreeningTestModeCodeSequence"
  },
  "00240018": {
    tag: "(0024,0018)",
    vr: "FL",
    vm: "1",
    name: "MaximumStimulusLuminance"
  },
  "00240020": {
    tag: "(0024,0020)",
    vr: "FL",
    vm: "1",
    name: "BackgroundLuminance"
  },
  "00240021": {
    tag: "(0024,0021)",
    vr: "SQ",
    vm: "1",
    name: "StimulusColorCodeSequence"
  },
  "00240024": {
    tag: "(0024,0024)",
    vr: "SQ",
    vm: "1",
    name: "BackgroundIlluminationColorCodeSequence"
  },
  "00240025": {
    tag: "(0024,0025)",
    vr: "FL",
    vm: "1",
    name: "StimulusArea"
  },
  "00240028": {
    tag: "(0024,0028)",
    vr: "FL",
    vm: "1",
    name: "StimulusPresentationTime"
  },
  "00240032": {
    tag: "(0024,0032)",
    vr: "SQ",
    vm: "1",
    name: "FixationSequence"
  },
  "00240033": {
    tag: "(0024,0033)",
    vr: "SQ",
    vm: "1",
    name: "FixationMonitoringCodeSequence"
  },
  "00240034": {
    tag: "(0024,0034)",
    vr: "SQ",
    vm: "1",
    name: "VisualFieldCatchTrialSequence"
  },
  "00240035": {
    tag: "(0024,0035)",
    vr: "US",
    vm: "1",
    name: "FixationCheckedQuantity"
  },
  "00240036": {
    tag: "(0024,0036)",
    vr: "US",
    vm: "1",
    name: "PatientNotProperlyFixatedQuantity"
  },
  "00240037": {
    tag: "(0024,0037)",
    vr: "CS",
    vm: "1",
    name: "PresentedVisualStimuliDataFlag"
  },
  "00240038": {
    tag: "(0024,0038)",
    vr: "US",
    vm: "1",
    name: "NumberOfVisualStimuli"
  },
  "00240039": {
    tag: "(0024,0039)",
    vr: "CS",
    vm: "1",
    name: "ExcessiveFixationLossesDataFlag"
  },
  "00240040": {
    tag: "(0024,0040)",
    vr: "CS",
    vm: "1",
    name: "ExcessiveFixationLosses"
  },
  "00240042": {
    tag: "(0024,0042)",
    vr: "US",
    vm: "1",
    name: "StimuliRetestingQuantity"
  },
  "00240044": {
    tag: "(0024,0044)",
    vr: "LT",
    vm: "1",
    name: "CommentsOnPatientPerformanceOfVisualField"
  },
  "00240045": {
    tag: "(0024,0045)",
    vr: "CS",
    vm: "1",
    name: "FalseNegativesEstimateFlag"
  },
  "00240046": {
    tag: "(0024,0046)",
    vr: "FL",
    vm: "1",
    name: "FalseNegativesEstimate"
  },
  "00240048": {
    tag: "(0024,0048)",
    vr: "US",
    vm: "1",
    name: "NegativeCatchTrialsQuantity"
  },
  "00240050": {
    tag: "(0024,0050)",
    vr: "US",
    vm: "1",
    name: "FalseNegativesQuantity"
  },
  "00240051": {
    tag: "(0024,0051)",
    vr: "CS",
    vm: "1",
    name: "ExcessiveFalseNegativesDataFlag"
  },
  "00240052": {
    tag: "(0024,0052)",
    vr: "CS",
    vm: "1",
    name: "ExcessiveFalseNegatives"
  },
  "00240053": {
    tag: "(0024,0053)",
    vr: "CS",
    vm: "1",
    name: "FalsePositivesEstimateFlag"
  },
  "00240054": {
    tag: "(0024,0054)",
    vr: "FL",
    vm: "1",
    name: "FalsePositivesEstimate"
  },
  "00240055": {
    tag: "(0024,0055)",
    vr: "CS",
    vm: "1",
    name: "CatchTrialsDataFlag"
  },
  "00240056": {
    tag: "(0024,0056)",
    vr: "US",
    vm: "1",
    name: "PositiveCatchTrialsQuantity"
  },
  "00240057": {
    tag: "(0024,0057)",
    vr: "CS",
    vm: "1",
    name: "TestPointNormalsDataFlag"
  },
  "00240058": {
    tag: "(0024,0058)",
    vr: "SQ",
    vm: "1",
    name: "TestPointNormalsSequence"
  },
  "00240059": {
    tag: "(0024,0059)",
    vr: "CS",
    vm: "1",
    name: "GlobalDeviationProbabilityNormalsFlag"
  },
  "00240060": {
    tag: "(0024,0060)",
    vr: "US",
    vm: "1",
    name: "FalsePositivesQuantity"
  },
  "00240061": {
    tag: "(0024,0061)",
    vr: "CS",
    vm: "1",
    name: "ExcessiveFalsePositivesDataFlag"
  },
  "00240062": {
    tag: "(0024,0062)",
    vr: "CS",
    vm: "1",
    name: "ExcessiveFalsePositives"
  },
  "00240063": {
    tag: "(0024,0063)",
    vr: "CS",
    vm: "1",
    name: "VisualFieldTestNormalsFlag"
  },
  "00240064": {
    tag: "(0024,0064)",
    vr: "SQ",
    vm: "1",
    name: "ResultsNormalsSequence"
  },
  "00240065": {
    tag: "(0024,0065)",
    vr: "SQ",
    vm: "1",
    name: "AgeCorrectedSensitivityDeviationAlgorithmSequence"
  },
  "00240066": {
    tag: "(0024,0066)",
    vr: "FL",
    vm: "1",
    name: "GlobalDeviationFromNormal"
  },
  "00240067": {
    tag: "(0024,0067)",
    vr: "SQ",
    vm: "1",
    name: "GeneralizedDefectSensitivityDeviationAlgorithmSequence"
  },
  "00240068": {
    tag: "(0024,0068)",
    vr: "FL",
    vm: "1",
    name: "LocalizedDeviationFromNormal"
  },
  "00240069": {
    tag: "(0024,0069)",
    vr: "LO",
    vm: "1",
    name: "PatientReliabilityIndicator"
  },
  "00240070": {
    tag: "(0024,0070)",
    vr: "FL",
    vm: "1",
    name: "VisualFieldMeanSensitivity"
  },
  "00240071": {
    tag: "(0024,0071)",
    vr: "FL",
    vm: "1",
    name: "GlobalDeviationProbability"
  },
  "00240072": {
    tag: "(0024,0072)",
    vr: "CS",
    vm: "1",
    name: "LocalDeviationProbabilityNormalsFlag"
  },
  "00240073": {
    tag: "(0024,0073)",
    vr: "FL",
    vm: "1",
    name: "LocalizedDeviationProbability"
  },
  "00240074": {
    tag: "(0024,0074)",
    vr: "CS",
    vm: "1",
    name: "ShortTermFluctuationCalculated"
  },
  "00240075": {
    tag: "(0024,0075)",
    vr: "FL",
    vm: "1",
    name: "ShortTermFluctuation"
  },
  "00240076": {
    tag: "(0024,0076)",
    vr: "CS",
    vm: "1",
    name: "ShortTermFluctuationProbabilityCalculated"
  },
  "00240077": {
    tag: "(0024,0077)",
    vr: "FL",
    vm: "1",
    name: "ShortTermFluctuationProbability"
  },
  "00240078": {
    tag: "(0024,0078)",
    vr: "CS",
    vm: "1",
    name: "CorrectedLocalizedDeviationFromNormalCalculated"
  },
  "00240079": {
    tag: "(0024,0079)",
    vr: "FL",
    vm: "1",
    name: "CorrectedLocalizedDeviationFromNormal"
  },
  "00240080": {
    tag: "(0024,0080)",
    vr: "CS",
    vm: "1",
    name: "CorrectedLocalizedDeviationFromNormalProbabilityCalculated"
  },
  "00240081": {
    tag: "(0024,0081)",
    vr: "FL",
    vm: "1",
    name: "CorrectedLocalizedDeviationFromNormalProbability"
  },
  "00240083": {
    tag: "(0024,0083)",
    vr: "SQ",
    vm: "1",
    name: "GlobalDeviationProbabilitySequence"
  },
  "00240085": {
    tag: "(0024,0085)",
    vr: "SQ",
    vm: "1",
    name: "LocalizedDeviationProbabilitySequence"
  },
  "00240086": {
    tag: "(0024,0086)",
    vr: "CS",
    vm: "1",
    name: "FovealSensitivityMeasured"
  },
  "00240087": {
    tag: "(0024,0087)",
    vr: "FL",
    vm: "1",
    name: "FovealSensitivity"
  },
  "00240088": {
    tag: "(0024,0088)",
    vr: "FL",
    vm: "1",
    name: "VisualFieldTestDuration"
  },
  "00240089": {
    tag: "(0024,0089)",
    vr: "SQ",
    vm: "1",
    name: "VisualFieldTestPointSequence"
  },
  "00240090": {
    tag: "(0024,0090)",
    vr: "FL",
    vm: "1",
    name: "VisualFieldTestPointXCoordinate"
  },
  "00240091": {
    tag: "(0024,0091)",
    vr: "FL",
    vm: "1",
    name: "VisualFieldTestPointYCoordinate"
  },
  "00240092": {
    tag: "(0024,0092)",
    vr: "FL",
    vm: "1",
    name: "AgeCorrectedSensitivityDeviationValue"
  },
  "00240093": {
    tag: "(0024,0093)",
    vr: "CS",
    vm: "1",
    name: "StimulusResults"
  },
  "00240094": {
    tag: "(0024,0094)",
    vr: "FL",
    vm: "1",
    name: "SensitivityValue"
  },
  "00240095": {
    tag: "(0024,0095)",
    vr: "CS",
    vm: "1",
    name: "RetestStimulusSeen"
  },
  "00240096": {
    tag: "(0024,0096)",
    vr: "FL",
    vm: "1",
    name: "RetestSensitivityValue"
  },
  "00240097": {
    tag: "(0024,0097)",
    vr: "SQ",
    vm: "1",
    name: "VisualFieldTestPointNormalsSequence"
  },
  "00240098": {
    tag: "(0024,0098)",
    vr: "FL",
    vm: "1",
    name: "QuantifiedDefect"
  },
  "00240100": {
    tag: "(0024,0100)",
    vr: "FL",
    vm: "1",
    name: "AgeCorrectedSensitivityDeviationProbabilityValue"
  },
  "00240102": {
    tag: "(0024,0102)",
    vr: "CS",
    vm: "1",
    name: "GeneralizedDefectCorrectedSensitivityDeviationFlag"
  },
  "00240103": {
    tag: "(0024,0103)",
    vr: "FL",
    vm: "1",
    name: "GeneralizedDefectCorrectedSensitivityDeviationValue"
  },
  "00240104": {
    tag: "(0024,0104)",
    vr: "FL",
    vm: "1",
    name: "GeneralizedDefectCorrectedSensitivityDeviationProbabilityValue"
  },
  "00240105": {
    tag: "(0024,0105)",
    vr: "FL",
    vm: "1",
    name: "MinimumSensitivityValue"
  },
  "00240106": {
    tag: "(0024,0106)",
    vr: "CS",
    vm: "1",
    name: "BlindSpotLocalized"
  },
  "00240107": {
    tag: "(0024,0107)",
    vr: "FL",
    vm: "1",
    name: "BlindSpotXCoordinate"
  },
  "00240108": {
    tag: "(0024,0108)",
    vr: "FL",
    vm: "1",
    name: "BlindSpotYCoordinate"
  },
  "00240110": {
    tag: "(0024,0110)",
    vr: "SQ",
    vm: "1",
    name: "VisualAcuityMeasurementSequence"
  },
  "00240112": {
    tag: "(0024,0112)",
    vr: "SQ",
    vm: "1",
    name: "RefractiveParametersUsedOnPatientSequence"
  },
  "00240113": {
    tag: "(0024,0113)",
    vr: "CS",
    vm: "1",
    name: "MeasurementLaterality"
  },
  "00240114": {
    tag: "(0024,0114)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicPatientClinicalInformationLeftEyeSequence"
  },
  "00240115": {
    tag: "(0024,0115)",
    vr: "SQ",
    vm: "1",
    name: "OphthalmicPatientClinicalInformationRightEyeSequence"
  },
  "00240117": {
    tag: "(0024,0117)",
    vr: "CS",
    vm: "1",
    name: "FovealPointNormativeDataFlag"
  },
  "00240118": {
    tag: "(0024,0118)",
    vr: "FL",
    vm: "1",
    name: "FovealPointProbabilityValue"
  },
  "00240120": {
    tag: "(0024,0120)",
    vr: "CS",
    vm: "1",
    name: "ScreeningBaselineMeasured"
  },
  "00240122": {
    tag: "(0024,0122)",
    vr: "SQ",
    vm: "1",
    name: "ScreeningBaselineMeasuredSequence"
  },
  "00240124": {
    tag: "(0024,0124)",
    vr: "CS",
    vm: "1",
    name: "ScreeningBaselineType"
  },
  "00240126": {
    tag: "(0024,0126)",
    vr: "FL",
    vm: "1",
    name: "ScreeningBaselineValue"
  },
  "00240202": {
    tag: "(0024,0202)",
    vr: "LO",
    vm: "1",
    name: "AlgorithmSource"
  },
  "00240306": {
    tag: "(0024,0306)",
    vr: "LO",
    vm: "1",
    name: "DataSetName"
  },
  "00240307": {
    tag: "(0024,0307)",
    vr: "LO",
    vm: "1",
    name: "DataSetVersion"
  },
  "00240308": {
    tag: "(0024,0308)",
    vr: "LO",
    vm: "1",
    name: "DataSetSource"
  },
  "00240309": {
    tag: "(0024,0309)",
    vr: "LO",
    vm: "1",
    name: "DataSetDescription"
  },
  "00240317": {
    tag: "(0024,0317)",
    vr: "SQ",
    vm: "1",
    name: "VisualFieldTestReliabilityGlobalIndexSequence"
  },
  "00240320": {
    tag: "(0024,0320)",
    vr: "SQ",
    vm: "1",
    name: "VisualFieldGlobalResultsIndexSequence"
  },
  "00240325": {
    tag: "(0024,0325)",
    vr: "SQ",
    vm: "1",
    name: "DataObservationSequence"
  },
  "00240338": {
    tag: "(0024,0338)",
    vr: "CS",
    vm: "1",
    name: "IndexNormalsFlag"
  },
  "00240341": {
    tag: "(0024,0341)",
    vr: "FL",
    vm: "1",
    name: "IndexProbability"
  },
  "00240344": {
    tag: "(0024,0344)",
    vr: "SQ",
    vm: "1",
    name: "IndexProbabilitySequence"
  },
  "00280002": {
    tag: "(0028,0002)",
    vr: "US",
    vm: "1",
    name: "SamplesPerPixel"
  },
  "00280003": {
    tag: "(0028,0003)",
    vr: "US",
    vm: "1",
    name: "SamplesPerPixelUsed"
  },
  "00280004": {
    tag: "(0028,0004)",
    vr: "CS",
    vm: "1",
    name: "PhotometricInterpretation"
  },
  "00280005": {
    tag: "(0028,0005)",
    vr: "US",
    vm: "1",
    name: "ImageDimensions"
  },
  "00280006": {
    tag: "(0028,0006)",
    vr: "US",
    vm: "1",
    name: "PlanarConfiguration"
  },
  "00280008": {
    tag: "(0028,0008)",
    vr: "IS",
    vm: "1",
    name: "NumberOfFrames"
  },
  "00280009": {
    tag: "(0028,0009)",
    vr: "AT",
    vm: "1-n",
    name: "FrameIncrementPointer"
  },
  "0028000A": {
    tag: "(0028,000A)",
    vr: "AT",
    vm: "1-n",
    name: "FrameDimensionPointer"
  },
  "00280010": {
    tag: "(0028,0010)",
    vr: "US",
    vm: "1",
    name: "Rows"
  },
  "00280011": {
    tag: "(0028,0011)",
    vr: "US",
    vm: "1",
    name: "Columns"
  },
  "00280012": {
    tag: "(0028,0012)",
    vr: "US",
    vm: "1",
    name: "Planes"
  },
  "00280014": {
    tag: "(0028,0014)",
    vr: "US",
    vm: "1",
    name: "UltrasoundColorDataPresent"
  },
  "00280020": {
    tag: "(0028,0020)",
    name: "",
    vr: "",
    vm: ""
  },
  "00280030": {
    tag: "(0028,0030)",
    vr: "DS",
    vm: "2",
    name: "PixelSpacing"
  },
  "00280031": {
    tag: "(0028,0031)",
    vr: "DS",
    vm: "2",
    name: "ZoomFactor"
  },
  "00280032": {
    tag: "(0028,0032)",
    vr: "DS",
    vm: "2",
    name: "ZoomCenter"
  },
  "00280034": {
    tag: "(0028,0034)",
    vr: "IS",
    vm: "2",
    name: "PixelAspectRatio"
  },
  "00280040": {
    tag: "(0028,0040)",
    vr: "CS",
    vm: "1",
    name: "ImageFormat"
  },
  "00280050": {
    tag: "(0028,0050)",
    vr: "LO",
    vm: "1-n",
    name: "ManipulatedImage"
  },
  "00280051": {
    tag: "(0028,0051)",
    vr: "CS",
    vm: "1-n",
    name: "CorrectedImage"
  },
  "0028005F": {
    tag: "(0028,005F)",
    vr: "LO",
    vm: "1",
    name: "CompressionRecognitionCode"
  },
  "00280060": {
    tag: "(0028,0060)",
    vr: "CS",
    vm: "1",
    name: "CompressionCode"
  },
  "00280061": {
    tag: "(0028,0061)",
    vr: "SH",
    vm: "1",
    name: "CompressionOriginator"
  },
  "00280062": {
    tag: "(0028,0062)",
    vr: "LO",
    vm: "1",
    name: "CompressionLabel"
  },
  "00280063": {
    tag: "(0028,0063)",
    vr: "SH",
    vm: "1",
    name: "CompressionDescription"
  },
  "00280065": {
    tag: "(0028,0065)",
    vr: "CS",
    vm: "1-n",
    name: "CompressionSequence"
  },
  "00280066": {
    tag: "(0028,0066)",
    vr: "AT",
    vm: "1-n",
    name: "CompressionStepPointers"
  },
  "00280068": {
    tag: "(0028,0068)",
    vr: "US",
    vm: "1",
    name: "RepeatInterval"
  },
  "00280069": {
    tag: "(0028,0069)",
    vr: "US",
    vm: "1",
    name: "BitsGrouped"
  },
  "00280070": {
    tag: "(0028,0070)",
    vr: "US",
    vm: "1-n",
    name: "PerimeterTable"
  },
  "00280071": {
    tag: "(0028,0071)",
    vr: "US|SS",
    vm: "1",
    name: "PerimeterValue"
  },
  "00280080": {
    tag: "(0028,0080)",
    vr: "US",
    vm: "1",
    name: "PredictorRows"
  },
  "00280081": {
    tag: "(0028,0081)",
    vr: "US",
    vm: "1",
    name: "PredictorColumns"
  },
  "00280082": {
    tag: "(0028,0082)",
    vr: "US",
    vm: "1-n",
    name: "PredictorConstants"
  },
  "00280090": {
    tag: "(0028,0090)",
    vr: "CS",
    vm: "1",
    name: "BlockedPixels"
  },
  "00280091": {
    tag: "(0028,0091)",
    vr: "US",
    vm: "1",
    name: "BlockRows"
  },
  "00280092": {
    tag: "(0028,0092)",
    vr: "US",
    vm: "1",
    name: "BlockColumns"
  },
  "00280093": {
    tag: "(0028,0093)",
    vr: "US",
    vm: "1",
    name: "RowOverlap"
  },
  "00280094": {
    tag: "(0028,0094)",
    vr: "US",
    vm: "1",
    name: "ColumnOverlap"
  },
  "00280100": {
    tag: "(0028,0100)",
    vr: "US",
    vm: "1",
    name: "BitsAllocated"
  },
  "00280101": {
    tag: "(0028,0101)",
    vr: "US",
    vm: "1",
    name: "BitsStored"
  },
  "00280102": {
    tag: "(0028,0102)",
    vr: "US",
    vm: "1",
    name: "HighBit"
  },
  "00280103": {
    tag: "(0028,0103)",
    vr: "US",
    vm: "1",
    name: "PixelRepresentation"
  },
  "00280104": {
    tag: "(0028,0104)",
    vr: "US|SS",
    vm: "1",
    name: "SmallestValidPixelValue"
  },
  "00280105": {
    tag: "(0028,0105)",
    vr: "US|SS",
    vm: "1",
    name: "LargestValidPixelValue"
  },
  "00280106": {
    tag: "(0028,0106)",
    vr: "US|SS",
    vm: "1",
    name: "SmallestImagePixelValue"
  },
  "00280107": {
    tag: "(0028,0107)",
    vr: "US|SS",
    vm: "1",
    name: "LargestImagePixelValue"
  },
  "00280108": {
    tag: "(0028,0108)",
    vr: "US|SS",
    vm: "1",
    name: "SmallestPixelValueInSeries"
  },
  "00280109": {
    tag: "(0028,0109)",
    vr: "US|SS",
    vm: "1",
    name: "LargestPixelValueInSeries"
  },
  "00280110": {
    tag: "(0028,0110)",
    vr: "US|SS",
    vm: "1",
    name: "SmallestImagePixelValueInPlane"
  },
  "00280111": {
    tag: "(0028,0111)",
    vr: "US|SS",
    vm: "1",
    name: "LargestImagePixelValueInPlane"
  },
  "00280120": {
    tag: "(0028,0120)",
    vr: "US|SS",
    vm: "1",
    name: "PixelPaddingValue"
  },
  "00280121": {
    tag: "(0028,0121)",
    vr: "US|SS",
    vm: "1",
    name: "PixelPaddingRangeLimit"
  },
  "00280122": {
    tag: "(0028,0122)",
    vr: "FL",
    vm: "1",
    name: "FloatPixelPaddingValue"
  },
  "00280123": {
    tag: "(0028,0123)",
    vr: "FD",
    vm: "1",
    name: "DoubleFloatPixelPaddingValue"
  },
  "00280124": {
    tag: "(0028,0124)",
    vr: "FL",
    vm: "1",
    name: "FloatPixelPaddingRangeLimit"
  },
  "00280125": {
    tag: "(0028,0125)",
    vr: "FD",
    vm: "1",
    name: "DoubleFloatPixelPaddingRangeLimit"
  },
  "00280200": {
    tag: "(0028,0200)",
    vr: "US",
    vm: "1",
    name: "ImageLocation"
  },
  "00280300": {
    tag: "(0028,0300)",
    vr: "CS",
    vm: "1",
    name: "QualityControlImage"
  },
  "00280301": {
    tag: "(0028,0301)",
    vr: "CS",
    vm: "1",
    name: "BurnedInAnnotation"
  },
  "00280302": {
    tag: "(0028,0302)",
    vr: "CS",
    vm: "1",
    name: "RecognizableVisualFeatures"
  },
  "00280303": {
    tag: "(0028,0303)",
    vr: "CS",
    vm: "1",
    name: "LongitudinalTemporalInformationModified"
  },
  "00280304": {
    tag: "(0028,0304)",
    vr: "UI",
    vm: "1",
    name: "ReferencedColorPaletteInstanceUID"
  },
  "00280400": {
    tag: "(0028,0400)",
    vr: "LO",
    vm: "1",
    name: "TransformLabel"
  },
  "00280401": {
    tag: "(0028,0401)",
    vr: "LO",
    vm: "1",
    name: "TransformVersionNumber"
  },
  "00280402": {
    tag: "(0028,0402)",
    vr: "US",
    vm: "1",
    name: "NumberOfTransformSteps"
  },
  "00280403": {
    tag: "(0028,0403)",
    vr: "LO",
    vm: "1-n",
    name: "SequenceOfCompressedData"
  },
  "00280404": {
    tag: "(0028,0404)",
    vr: "AT",
    vm: "1-n",
    name: "DetailsOfCoefficients"
  },
  "002804x0": {
    tag: "(0028,04x0)",
    vr: "US",
    vm: "1",
    name: "RowsForNthOrderCoefficients"
  },
  "002804x1": {
    tag: "(0028,04x1)",
    vr: "US",
    vm: "1",
    name: "ColumnsForNthOrderCoefficients"
  },
  "002804x2": {
    tag: "(0028,04x2)",
    vr: "LO",
    vm: "1-n",
    name: "CoefficientCoding"
  },
  "002804x3": {
    tag: "(0028,04x3)",
    vr: "AT",
    vm: "1-n",
    name: "CoefficientCodingPointers"
  },
  "00280700": {
    tag: "(0028,0700)",
    vr: "LO",
    vm: "1",
    name: "DCTLabel"
  },
  "00280701": {
    tag: "(0028,0701)",
    vr: "CS",
    vm: "1-n",
    name: "DataBlockDescription"
  },
  "00280702": {
    tag: "(0028,0702)",
    vr: "AT",
    vm: "1-n",
    name: "DataBlock"
  },
  "00280710": {
    tag: "(0028,0710)",
    vr: "US",
    vm: "1",
    name: "NormalizationFactorFormat"
  },
  "00280720": {
    tag: "(0028,0720)",
    vr: "US",
    vm: "1",
    name: "ZonalMapNumberFormat"
  },
  "00280721": {
    tag: "(0028,0721)",
    vr: "AT",
    vm: "1-n",
    name: "ZonalMapLocation"
  },
  "00280722": {
    tag: "(0028,0722)",
    vr: "US",
    vm: "1",
    name: "ZonalMapFormat"
  },
  "00280730": {
    tag: "(0028,0730)",
    vr: "US",
    vm: "1",
    name: "AdaptiveMapFormat"
  },
  "00280740": {
    tag: "(0028,0740)",
    vr: "US",
    vm: "1",
    name: "CodeNumberFormat"
  },
  "002808x0": {
    tag: "(0028,08x0)",
    vr: "CS",
    vm: "1-n",
    name: "CodeLabel"
  },
  "002808x2": {
    tag: "(0028,08x2)",
    vr: "US",
    vm: "1",
    name: "NumberOfTables"
  },
  "002808x3": {
    tag: "(0028,08x3)",
    vr: "AT",
    vm: "1-n",
    name: "CodeTableLocation"
  },
  "002808x4": {
    tag: "(0028,08x4)",
    vr: "US",
    vm: "1",
    name: "BitsForCodeWord"
  },
  "002808x8": {
    tag: "(0028,08x8)",
    vr: "AT",
    vm: "1-n",
    name: "ImageDataLocation"
  },
  "00280A02": {
    tag: "(0028,0A02)",
    vr: "CS",
    vm: "1",
    name: "PixelSpacingCalibrationType"
  },
  "00280A04": {
    tag: "(0028,0A04)",
    vr: "LO",
    vm: "1",
    name: "PixelSpacingCalibrationDescription"
  },
  "00281040": {
    tag: "(0028,1040)",
    vr: "CS",
    vm: "1",
    name: "PixelIntensityRelationship"
  },
  "00281041": {
    tag: "(0028,1041)",
    vr: "SS",
    vm: "1",
    name: "PixelIntensityRelationshipSign"
  },
  "00281050": {
    tag: "(0028,1050)",
    vr: "DS",
    vm: "1-n",
    name: "WindowCenter"
  },
  "00281051": {
    tag: "(0028,1051)",
    vr: "DS",
    vm: "1-n",
    name: "WindowWidth"
  },
  "00281052": {
    tag: "(0028,1052)",
    vr: "DS",
    vm: "1",
    name: "RescaleIntercept"
  },
  "00281053": {
    tag: "(0028,1053)",
    vr: "DS",
    vm: "1",
    name: "RescaleSlope"
  },
  "00281054": {
    tag: "(0028,1054)",
    vr: "LO",
    vm: "1",
    name: "RescaleType"
  },
  "00281055": {
    tag: "(0028,1055)",
    vr: "LO",
    vm: "1-n",
    name: "WindowCenterWidthExplanation"
  },
  "00281056": {
    tag: "(0028,1056)",
    vr: "CS",
    vm: "1",
    name: "VOILUTFunction"
  },
  "00281080": {
    tag: "(0028,1080)",
    vr: "CS",
    vm: "1",
    name: "GrayScale"
  },
  "00281090": {
    tag: "(0028,1090)",
    vr: "CS",
    vm: "1",
    name: "RecommendedViewingMode"
  },
  "00281100": {
    tag: "(0028,1100)",
    vr: "US|SS",
    vm: "3",
    name: "GrayLookupTableDescriptor"
  },
  "00281101": {
    tag: "(0028,1101)",
    vr: "US|SS",
    vm: "3",
    name: "RedPaletteColorLookupTableDescriptor"
  },
  "00281102": {
    tag: "(0028,1102)",
    vr: "US|SS",
    vm: "3",
    name: "GreenPaletteColorLookupTableDescriptor"
  },
  "00281103": {
    tag: "(0028,1103)",
    vr: "US|SS",
    vm: "3",
    name: "BluePaletteColorLookupTableDescriptor"
  },
  "00281104": {
    tag: "(0028,1104)",
    vr: "US",
    vm: "3",
    name: "AlphaPaletteColorLookupTableDescriptor"
  },
  "00281111": {
    tag: "(0028,1111)",
    vr: "US|SS",
    vm: "4",
    name: "LargeRedPaletteColorLookupTableDescriptor"
  },
  "00281112": {
    tag: "(0028,1112)",
    vr: "US|SS",
    vm: "4",
    name: "LargeGreenPaletteColorLookupTableDescriptor"
  },
  "00281113": {
    tag: "(0028,1113)",
    vr: "US|SS",
    vm: "4",
    name: "LargeBluePaletteColorLookupTableDescriptor"
  },
  "00281199": {
    tag: "(0028,1199)",
    vr: "UI",
    vm: "1",
    name: "PaletteColorLookupTableUID"
  },
  "00281200": {
    tag: "(0028,1200)",
    name: "GrayLookupTableData",
    vr: ["US", "SS", "OW"],
    vm: "1-n or 1"
  },
  "00281201": {
    tag: "(0028,1201)",
    vr: "OW",
    vm: "1",
    name: "RedPaletteColorLookupTableData"
  },
  "00281202": {
    tag: "(0028,1202)",
    vr: "OW",
    vm: "1",
    name: "GreenPaletteColorLookupTableData"
  },
  "00281203": {
    tag: "(0028,1203)",
    vr: "OW",
    vm: "1",
    name: "BluePaletteColorLookupTableData"
  },
  "00281204": {
    tag: "(0028,1204)",
    vr: "OW",
    vm: "1",
    name: "AlphaPaletteColorLookupTableData"
  },
  "00281211": {
    tag: "(0028,1211)",
    vr: "OW",
    vm: "1",
    name: "LargeRedPaletteColorLookupTableData"
  },
  "00281212": {
    tag: "(0028,1212)",
    vr: "OW",
    vm: "1",
    name: "LargeGreenPaletteColorLookupTableData"
  },
  "00281213": {
    tag: "(0028,1213)",
    vr: "OW",
    vm: "1",
    name: "LargeBluePaletteColorLookupTableData"
  },
  "00281214": {
    tag: "(0028,1214)",
    vr: "UI",
    vm: "1",
    name: "LargePaletteColorLookupTableUID"
  },
  "00281221": {
    tag: "(0028,1221)",
    vr: "OW",
    vm: "1",
    name: "SegmentedRedPaletteColorLookupTableData"
  },
  "00281222": {
    tag: "(0028,1222)",
    vr: "OW",
    vm: "1",
    name: "SegmentedGreenPaletteColorLookupTableData"
  },
  "00281223": {
    tag: "(0028,1223)",
    vr: "OW",
    vm: "1",
    name: "SegmentedBluePaletteColorLookupTableData"
  },
  "00281224": {
    tag: "(0028,1224)",
    vr: "OW",
    vm: "1",
    name: "SegmentedAlphaPaletteColorLookupTableData"
  },
  "00281230": {
    tag: "(0028,1230)",
    vr: "SQ",
    vm: "1",
    name: "StoredValueColorRangeSequence"
  },
  "00281231": {
    tag: "(0028,1231)",
    vr: "FD",
    vm: "1",
    name: "MinimumStoredValueMapped"
  },
  "00281232": {
    tag: "(0028,1232)",
    vr: "FD",
    vm: "1",
    name: "MaximumStoredValueMapped"
  },
  "00281300": {
    tag: "(0028,1300)",
    vr: "CS",
    vm: "1",
    name: "BreastImplantPresent"
  },
  "00281350": {
    tag: "(0028,1350)",
    vr: "CS",
    vm: "1",
    name: "PartialView"
  },
  "00281351": {
    tag: "(0028,1351)",
    vr: "ST",
    vm: "1",
    name: "PartialViewDescription"
  },
  "00281352": {
    tag: "(0028,1352)",
    vr: "SQ",
    vm: "1",
    name: "PartialViewCodeSequence"
  },
  "0028135A": {
    tag: "(0028,135A)",
    vr: "CS",
    vm: "1",
    name: "SpatialLocationsPreserved"
  },
  "00281401": {
    tag: "(0028,1401)",
    vr: "SQ",
    vm: "1",
    name: "DataFrameAssignmentSequence"
  },
  "00281402": {
    tag: "(0028,1402)",
    vr: "CS",
    vm: "1",
    name: "DataPathAssignment"
  },
  "00281403": {
    tag: "(0028,1403)",
    vr: "US",
    vm: "1",
    name: "BitsMappedToColorLookupTable"
  },
  "00281404": {
    tag: "(0028,1404)",
    vr: "SQ",
    vm: "1",
    name: "BlendingLUT1Sequence"
  },
  "00281405": {
    tag: "(0028,1405)",
    vr: "CS",
    vm: "1",
    name: "BlendingLUT1TransferFunction"
  },
  "00281406": {
    tag: "(0028,1406)",
    vr: "FD",
    vm: "1",
    name: "BlendingWeightConstant"
  },
  "00281407": {
    tag: "(0028,1407)",
    vr: "US",
    vm: "3",
    name: "BlendingLookupTableDescriptor"
  },
  "00281408": {
    tag: "(0028,1408)",
    vr: "OW",
    vm: "1",
    name: "BlendingLookupTableData"
  },
  "0028140B": {
    tag: "(0028,140B)",
    vr: "SQ",
    vm: "1",
    name: "EnhancedPaletteColorLookupTableSequence"
  },
  "0028140C": {
    tag: "(0028,140C)",
    vr: "SQ",
    vm: "1",
    name: "BlendingLUT2Sequence"
  },
  "0028140D": {
    tag: "(0028,140D)",
    vr: "CS",
    vm: "1",
    name: "BlendingLUT2TransferFunction"
  },
  "0028140E": {
    tag: "(0028,140E)",
    vr: "CS",
    vm: "1",
    name: "DataPathID"
  },
  "0028140F": {
    tag: "(0028,140F)",
    vr: "CS",
    vm: "1",
    name: "RGBLUTTransferFunction"
  },
  "00281410": {
    tag: "(0028,1410)",
    vr: "CS",
    vm: "1",
    name: "AlphaLUTTransferFunction"
  },
  "00282000": {
    tag: "(0028,2000)",
    vr: "OB",
    vm: "1",
    name: "ICCProfile"
  },
  "00282002": {
    tag: "(0028,2002)",
    vr: "CS",
    vm: "1",
    name: "ColorSpace"
  },
  "00282110": {
    tag: "(0028,2110)",
    vr: "CS",
    vm: "1",
    name: "LossyImageCompression"
  },
  "00282112": {
    tag: "(0028,2112)",
    vr: "DS",
    vm: "1-n",
    name: "LossyImageCompressionRatio"
  },
  "00282114": {
    tag: "(0028,2114)",
    vr: "CS",
    vm: "1-n",
    name: "LossyImageCompressionMethod"
  },
  "00283000": {
    tag: "(0028,3000)",
    vr: "SQ",
    vm: "1",
    name: "ModalityLUTSequence"
  },
  "00283002": {
    tag: "(0028,3002)",
    vr: "US|SS",
    vm: "3",
    name: "LUTDescriptor"
  },
  "00283003": {
    tag: "(0028,3003)",
    vr: "LO",
    vm: "1",
    name: "LUTExplanation"
  },
  "00283004": {
    tag: "(0028,3004)",
    vr: "LO",
    vm: "1",
    name: "ModalityLUTType"
  },
  "00283006": {
    tag: "(0028,3006)",
    vr: "US|OW",
    vm: "1-n or 1",
    name: "LUTData"
  },
  "00283010": {
    tag: "(0028,3010)",
    vr: "SQ",
    vm: "1",
    name: "VOILUTSequence"
  },
  "00283110": {
    tag: "(0028,3110)",
    vr: "SQ",
    vm: "1",
    name: "SoftcopyVOILUTSequence"
  },
  "00284000": {
    tag: "(0028,4000)",
    vr: "LT",
    vm: "1",
    name: "ImagePresentationComments"
  },
  "00285000": {
    tag: "(0028,5000)",
    vr: "SQ",
    vm: "1",
    name: "BiPlaneAcquisitionSequence"
  },
  "00286010": {
    tag: "(0028,6010)",
    vr: "US",
    vm: "1",
    name: "RepresentativeFrameNumber"
  },
  "00286020": {
    tag: "(0028,6020)",
    vr: "US",
    vm: "1-n",
    name: "FrameNumbersOfInterest"
  },
  "00286022": {
    tag: "(0028,6022)",
    vr: "LO",
    vm: "1-n",
    name: "FrameOfInterestDescription"
  },
  "00286023": {
    tag: "(0028,6023)",
    vr: "CS",
    vm: "1-n",
    name: "FrameOfInterestType"
  },
  "00286030": {
    tag: "(0028,6030)",
    vr: "US",
    vm: "1-n",
    name: "MaskPointers"
  },
  "00286040": {
    tag: "(0028,6040)",
    vr: "US",
    vm: "1-n",
    name: "RWavePointer"
  },
  "00286100": {
    tag: "(0028,6100)",
    vr: "SQ",
    vm: "1",
    name: "MaskSubtractionSequence"
  },
  "00286101": {
    tag: "(0028,6101)",
    vr: "CS",
    vm: "1",
    name: "MaskOperation"
  },
  "00286102": {
    tag: "(0028,6102)",
    vr: "US",
    vm: "2-2n",
    name: "ApplicableFrameRange"
  },
  "00286110": {
    tag: "(0028,6110)",
    vr: "US",
    vm: "1-n",
    name: "MaskFrameNumbers"
  },
  "00286112": {
    tag: "(0028,6112)",
    vr: "US",
    vm: "1",
    name: "ContrastFrameAveraging"
  },
  "00286114": {
    tag: "(0028,6114)",
    vr: "FL",
    vm: "2",
    name: "MaskSubPixelShift"
  },
  "00286120": {
    tag: "(0028,6120)",
    vr: "SS",
    vm: "1",
    name: "TIDOffset"
  },
  "00286190": {
    tag: "(0028,6190)",
    vr: "ST",
    vm: "1",
    name: "MaskOperationExplanation"
  },
  "00287000": {
    tag: "(0028,7000)",
    vr: "SQ",
    vm: "1",
    name: "EquipmentAdministratorSequence"
  },
  "00287001": {
    tag: "(0028,7001)",
    vr: "US",
    vm: "1",
    name: "NumberOfDisplaySubsystems"
  },
  "00287002": {
    tag: "(0028,7002)",
    vr: "US",
    vm: "1",
    name: "CurrentConfigurationID"
  },
  "00287003": {
    tag: "(0028,7003)",
    vr: "US",
    vm: "1",
    name: "DisplaySubsystemID"
  },
  "00287004": {
    tag: "(0028,7004)",
    vr: "SH",
    vm: "1",
    name: "DisplaySubsystemName"
  },
  "00287005": {
    tag: "(0028,7005)",
    vr: "LO",
    vm: "1",
    name: "DisplaySubsystemDescription"
  },
  "00287006": {
    tag: "(0028,7006)",
    vr: "CS",
    vm: "1",
    name: "SystemStatus"
  },
  "00287007": {
    tag: "(0028,7007)",
    vr: "LO",
    vm: "1",
    name: "SystemStatusComment"
  },
  "00287008": {
    tag: "(0028,7008)",
    vr: "SQ",
    vm: "1",
    name: "TargetLuminanceCharacteristicsSequence"
  },
  "00287009": {
    tag: "(0028,7009)",
    vr: "US",
    vm: "1",
    name: "LuminanceCharacteristicsID"
  },
  "0028700A": {
    tag: "(0028,700A)",
    vr: "SQ",
    vm: "1",
    name: "DisplaySubsystemConfigurationSequence"
  },
  "0028700B": {
    tag: "(0028,700B)",
    vr: "US",
    vm: "1",
    name: "ConfigurationID"
  },
  "0028700C": {
    tag: "(0028,700C)",
    vr: "SH",
    vm: "1",
    name: "ConfigurationName"
  },
  "0028700D": {
    tag: "(0028,700D)",
    vr: "LO",
    vm: "1",
    name: "ConfigurationDescription"
  },
  "0028700E": {
    tag: "(0028,700E)",
    vr: "US",
    vm: "1",
    name: "ReferencedTargetLuminanceCharacteristicsID"
  },
  "0028700F": {
    tag: "(0028,700F)",
    vr: "SQ",
    vm: "1",
    name: "QAResultsSequence"
  },
  "00287010": {
    tag: "(0028,7010)",
    vr: "SQ",
    vm: "1",
    name: "DisplaySubsystemQAResultsSequence"
  },
  "00287011": {
    tag: "(0028,7011)",
    vr: "SQ",
    vm: "1",
    name: "ConfigurationQAResultsSequence"
  },
  "00287012": {
    tag: "(0028,7012)",
    vr: "SQ",
    vm: "1",
    name: "MeasurementEquipmentSequence"
  },
  "00287013": {
    tag: "(0028,7013)",
    vr: "CS",
    vm: "1-n",
    name: "MeasurementFunctions"
  },
  "00287014": {
    tag: "(0028,7014)",
    vr: "CS",
    vm: "1",
    name: "MeasurementEquipmentType"
  },
  "00287015": {
    tag: "(0028,7015)",
    vr: "SQ",
    vm: "1",
    name: "VisualEvaluationResultSequence"
  },
  "00287016": {
    tag: "(0028,7016)",
    vr: "SQ",
    vm: "1",
    name: "DisplayCalibrationResultSequence"
  },
  "00287017": {
    tag: "(0028,7017)",
    vr: "US",
    vm: "1",
    name: "DDLValue"
  },
  "00287018": {
    tag: "(0028,7018)",
    vr: "FL",
    vm: "2",
    name: "CIExyWhitePoint"
  },
  "00287019": {
    tag: "(0028,7019)",
    vr: "CS",
    vm: "1",
    name: "DisplayFunctionType"
  },
  "0028701A": {
    tag: "(0028,701A)",
    vr: "FL",
    vm: "1",
    name: "GammaValue"
  },
  "0028701B": {
    tag: "(0028,701B)",
    vr: "US",
    vm: "1",
    name: "NumberOfLuminancePoints"
  },
  "0028701C": {
    tag: "(0028,701C)",
    vr: "SQ",
    vm: "1",
    name: "LuminanceResponseSequence"
  },
  "0028701D": {
    tag: "(0028,701D)",
    vr: "FL",
    vm: "1",
    name: "TargetMinimumLuminance"
  },
  "0028701E": {
    tag: "(0028,701E)",
    vr: "FL",
    vm: "1",
    name: "TargetMaximumLuminance"
  },
  "0028701F": {
    tag: "(0028,701F)",
    vr: "FL",
    vm: "1",
    name: "LuminanceValue"
  },
  "00287020": {
    tag: "(0028,7020)",
    vr: "LO",
    vm: "1",
    name: "LuminanceResponseDescription"
  },
  "00287021": {
    tag: "(0028,7021)",
    vr: "CS",
    vm: "1",
    name: "WhitePointFlag"
  },
  "00287022": {
    tag: "(0028,7022)",
    vr: "SQ",
    vm: "1",
    name: "DisplayDeviceTypeCodeSequence"
  },
  "00287023": {
    tag: "(0028,7023)",
    vr: "SQ",
    vm: "1",
    name: "DisplaySubsystemSequence"
  },
  "00287024": {
    tag: "(0028,7024)",
    vr: "SQ",
    vm: "1",
    name: "LuminanceResultSequence"
  },
  "00287025": {
    tag: "(0028,7025)",
    vr: "CS",
    vm: "1",
    name: "AmbientLightValueSource"
  },
  "00287026": {
    tag: "(0028,7026)",
    vr: "CS",
    vm: "1-n",
    name: "MeasuredCharacteristics"
  },
  "00287027": {
    tag: "(0028,7027)",
    vr: "SQ",
    vm: "1",
    name: "LuminanceUniformityResultSequence"
  },
  "00287028": {
    tag: "(0028,7028)",
    vr: "SQ",
    vm: "1",
    name: "VisualEvaluationTestSequence"
  },
  "00287029": {
    tag: "(0028,7029)",
    vr: "CS",
    vm: "1",
    name: "TestResult"
  },
  "0028702A": {
    tag: "(0028,702A)",
    vr: "LO",
    vm: "1",
    name: "TestResultComment"
  },
  "0028702B": {
    tag: "(0028,702B)",
    vr: "CS",
    vm: "1",
    name: "TestImageValidation"
  },
  "0028702C": {
    tag: "(0028,702C)",
    vr: "SQ",
    vm: "1",
    name: "TestPatternCodeSequence"
  },
  "0028702D": {
    tag: "(0028,702D)",
    vr: "SQ",
    vm: "1",
    name: "MeasurementPatternCodeSequence"
  },
  "0028702E": {
    tag: "(0028,702E)",
    vr: "SQ",
    vm: "1",
    name: "VisualEvaluationMethodCodeSequence"
  },
  "00287FE0": {
    tag: "(0028,7FE0)",
    vr: "UR",
    vm: "1",
    name: "PixelDataProviderURL"
  },
  "00289001": {
    tag: "(0028,9001)",
    vr: "UL",
    vm: "1",
    name: "DataPointRows"
  },
  "00289002": {
    tag: "(0028,9002)",
    vr: "UL",
    vm: "1",
    name: "DataPointColumns"
  },
  "00289003": {
    tag: "(0028,9003)",
    vr: "CS",
    vm: "1",
    name: "SignalDomainColumns"
  },
  "00289099": {
    tag: "(0028,9099)",
    vr: "US",
    vm: "1",
    name: "LargestMonochromePixelValue"
  },
  "00289108": {
    tag: "(0028,9108)",
    vr: "CS",
    vm: "1",
    name: "DataRepresentation"
  },
  "00289110": {
    tag: "(0028,9110)",
    vr: "SQ",
    vm: "1",
    name: "PixelMeasuresSequence"
  },
  "00289132": {
    tag: "(0028,9132)",
    vr: "SQ",
    vm: "1",
    name: "FrameVOILUTSequence"
  },
  "00289145": {
    tag: "(0028,9145)",
    vr: "SQ",
    vm: "1",
    name: "PixelValueTransformationSequence"
  },
  "00289235": {
    tag: "(0028,9235)",
    vr: "CS",
    vm: "1",
    name: "SignalDomainRows"
  },
  "00289411": {
    tag: "(0028,9411)",
    vr: "FL",
    vm: "1",
    name: "DisplayFilterPercentage"
  },
  "00289415": {
    tag: "(0028,9415)",
    vr: "SQ",
    vm: "1",
    name: "FramePixelShiftSequence"
  },
  "00289416": {
    tag: "(0028,9416)",
    vr: "US",
    vm: "1",
    name: "SubtractionItemID"
  },
  "00289422": {
    tag: "(0028,9422)",
    vr: "SQ",
    vm: "1",
    name: "PixelIntensityRelationshipLUTSequence"
  },
  "00289443": {
    tag: "(0028,9443)",
    vr: "SQ",
    vm: "1",
    name: "FramePixelDataPropertiesSequence"
  },
  "00289444": {
    tag: "(0028,9444)",
    vr: "CS",
    vm: "1",
    name: "GeometricalProperties"
  },
  "00289445": {
    tag: "(0028,9445)",
    vr: "FL",
    vm: "1",
    name: "GeometricMaximumDistortion"
  },
  "00289446": {
    tag: "(0028,9446)",
    vr: "CS",
    vm: "1-n",
    name: "ImageProcessingApplied"
  },
  "00289454": {
    tag: "(0028,9454)",
    vr: "CS",
    vm: "1",
    name: "MaskSelectionMode"
  },
  "00289474": {
    tag: "(0028,9474)",
    vr: "CS",
    vm: "1",
    name: "LUTFunction"
  },
  "00289478": {
    tag: "(0028,9478)",
    vr: "FL",
    vm: "1",
    name: "MaskVisibilityPercentage"
  },
  "00289501": {
    tag: "(0028,9501)",
    vr: "SQ",
    vm: "1",
    name: "PixelShiftSequence"
  },
  "00289502": {
    tag: "(0028,9502)",
    vr: "SQ",
    vm: "1",
    name: "RegionPixelShiftSequence"
  },
  "00289503": {
    tag: "(0028,9503)",
    vr: "SS",
    vm: "2-2n",
    name: "VerticesOfTheRegion"
  },
  "00289505": {
    tag: "(0028,9505)",
    vr: "SQ",
    vm: "1",
    name: "MultiFramePresentationSequence"
  },
  "00289506": {
    tag: "(0028,9506)",
    vr: "US",
    vm: "2-2n",
    name: "PixelShiftFrameRange"
  },
  "00289507": {
    tag: "(0028,9507)",
    vr: "US",
    vm: "2-2n",
    name: "LUTFrameRange"
  },
  "00289520": {
    tag: "(0028,9520)",
    vr: "DS",
    vm: "16",
    name: "ImageToEquipmentMappingMatrix"
  },
  "00289537": {
    tag: "(0028,9537)",
    vr: "CS",
    vm: "1",
    name: "EquipmentCoordinateSystemIdentification"
  },
  "0032000A": {
    tag: "(0032,000A)",
    vr: "CS",
    vm: "1",
    name: "StudyStatusID"
  },
  "0032000C": {
    tag: "(0032,000C)",
    vr: "CS",
    vm: "1",
    name: "StudyPriorityID"
  },
  "00320012": {
    tag: "(0032,0012)",
    vr: "LO",
    vm: "1",
    name: "StudyIDIssuer"
  },
  "00320032": {
    tag: "(0032,0032)",
    vr: "DA",
    vm: "1",
    name: "StudyVerifiedDate"
  },
  "00320033": {
    tag: "(0032,0033)",
    vr: "TM",
    vm: "1",
    name: "StudyVerifiedTime"
  },
  "00320034": {
    tag: "(0032,0034)",
    vr: "DA",
    vm: "1",
    name: "StudyReadDate"
  },
  "00320035": {
    tag: "(0032,0035)",
    vr: "TM",
    vm: "1",
    name: "StudyReadTime"
  },
  "00321000": {
    tag: "(0032,1000)",
    vr: "DA",
    vm: "1",
    name: "ScheduledStudyStartDate"
  },
  "00321001": {
    tag: "(0032,1001)",
    vr: "TM",
    vm: "1",
    name: "ScheduledStudyStartTime"
  },
  "00321010": {
    tag: "(0032,1010)",
    vr: "DA",
    vm: "1",
    name: "ScheduledStudyStopDate"
  },
  "00321011": {
    tag: "(0032,1011)",
    vr: "TM",
    vm: "1",
    name: "ScheduledStudyStopTime"
  },
  "00321020": {
    tag: "(0032,1020)",
    vr: "LO",
    vm: "1",
    name: "ScheduledStudyLocation"
  },
  "00321021": {
    tag: "(0032,1021)",
    vr: "AE",
    vm: "1-n",
    name: "ScheduledStudyLocationAETitle"
  },
  "00321030": {
    tag: "(0032,1030)",
    vr: "LO",
    vm: "1",
    name: "ReasonForStudy"
  },
  "00321031": {
    tag: "(0032,1031)",
    vr: "SQ",
    vm: "1",
    name: "RequestingPhysicianIdentificationSequence"
  },
  "00321032": {
    tag: "(0032,1032)",
    vr: "PN",
    vm: "1",
    name: "RequestingPhysician"
  },
  "00321033": {
    tag: "(0032,1033)",
    vr: "LO",
    vm: "1",
    name: "RequestingService"
  },
  "00321034": {
    tag: "(0032,1034)",
    vr: "SQ",
    vm: "1",
    name: "RequestingServiceCodeSequence"
  },
  "00321040": {
    tag: "(0032,1040)",
    vr: "DA",
    vm: "1",
    name: "StudyArrivalDate"
  },
  "00321041": {
    tag: "(0032,1041)",
    vr: "TM",
    vm: "1",
    name: "StudyArrivalTime"
  },
  "00321050": {
    tag: "(0032,1050)",
    vr: "DA",
    vm: "1",
    name: "StudyCompletionDate"
  },
  "00321051": {
    tag: "(0032,1051)",
    vr: "TM",
    vm: "1",
    name: "StudyCompletionTime"
  },
  "00321055": {
    tag: "(0032,1055)",
    vr: "CS",
    vm: "1",
    name: "StudyComponentStatusID"
  },
  "00321060": {
    tag: "(0032,1060)",
    vr: "LO",
    vm: "1",
    name: "RequestedProcedureDescription"
  },
  "00321064": {
    tag: "(0032,1064)",
    vr: "SQ",
    vm: "1",
    name: "RequestedProcedureCodeSequence"
  },
  "00321070": {
    tag: "(0032,1070)",
    vr: "LO",
    vm: "1",
    name: "RequestedContrastAgent"
  },
  "00324000": {
    tag: "(0032,4000)",
    vr: "LT",
    vm: "1",
    name: "StudyComments"
  },
  "00380004": {
    tag: "(0038,0004)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPatientAliasSequence"
  },
  "00380008": {
    tag: "(0038,0008)",
    vr: "CS",
    vm: "1",
    name: "VisitStatusID"
  },
  "00380010": {
    tag: "(0038,0010)",
    vr: "LO",
    vm: "1",
    name: "AdmissionID"
  },
  "00380011": {
    tag: "(0038,0011)",
    vr: "LO",
    vm: "1",
    name: "IssuerOfAdmissionID"
  },
  "00380014": {
    tag: "(0038,0014)",
    vr: "SQ",
    vm: "1",
    name: "IssuerOfAdmissionIDSequence"
  },
  "00380016": {
    tag: "(0038,0016)",
    vr: "LO",
    vm: "1",
    name: "RouteOfAdmissions"
  },
  "0038001A": {
    tag: "(0038,001A)",
    vr: "DA",
    vm: "1",
    name: "ScheduledAdmissionDate"
  },
  "0038001B": {
    tag: "(0038,001B)",
    vr: "TM",
    vm: "1",
    name: "ScheduledAdmissionTime"
  },
  "0038001C": {
    tag: "(0038,001C)",
    vr: "DA",
    vm: "1",
    name: "ScheduledDischargeDate"
  },
  "0038001D": {
    tag: "(0038,001D)",
    vr: "TM",
    vm: "1",
    name: "ScheduledDischargeTime"
  },
  "0038001E": {
    tag: "(0038,001E)",
    vr: "LO",
    vm: "1",
    name: "ScheduledPatientInstitutionResidence"
  },
  "00380020": {
    tag: "(0038,0020)",
    vr: "DA",
    vm: "1",
    name: "AdmittingDate"
  },
  "00380021": {
    tag: "(0038,0021)",
    vr: "TM",
    vm: "1",
    name: "AdmittingTime"
  },
  "00380030": {
    tag: "(0038,0030)",
    vr: "DA",
    vm: "1",
    name: "DischargeDate"
  },
  "00380032": {
    tag: "(0038,0032)",
    vr: "TM",
    vm: "1",
    name: "DischargeTime"
  },
  "00380040": {
    tag: "(0038,0040)",
    vr: "LO",
    vm: "1",
    name: "DischargeDiagnosisDescription"
  },
  "00380044": {
    tag: "(0038,0044)",
    vr: "SQ",
    vm: "1",
    name: "DischargeDiagnosisCodeSequence"
  },
  "00380050": {
    tag: "(0038,0050)",
    vr: "LO",
    vm: "1",
    name: "SpecialNeeds"
  },
  "00380060": {
    tag: "(0038,0060)",
    vr: "LO",
    vm: "1",
    name: "ServiceEpisodeID"
  },
  "00380061": {
    tag: "(0038,0061)",
    vr: "LO",
    vm: "1",
    name: "IssuerOfServiceEpisodeID"
  },
  "00380062": {
    tag: "(0038,0062)",
    vr: "LO",
    vm: "1",
    name: "ServiceEpisodeDescription"
  },
  "00380064": {
    tag: "(0038,0064)",
    vr: "SQ",
    vm: "1",
    name: "IssuerOfServiceEpisodeIDSequence"
  },
  "00380100": {
    tag: "(0038,0100)",
    vr: "SQ",
    vm: "1",
    name: "PertinentDocumentsSequence"
  },
  "00380101": {
    tag: "(0038,0101)",
    vr: "SQ",
    vm: "1",
    name: "PertinentResourcesSequence"
  },
  "00380102": {
    tag: "(0038,0102)",
    vr: "LO",
    vm: "1",
    name: "ResourceDescription"
  },
  "00380300": {
    tag: "(0038,0300)",
    vr: "LO",
    vm: "1",
    name: "CurrentPatientLocation"
  },
  "00380400": {
    tag: "(0038,0400)",
    vr: "LO",
    vm: "1",
    name: "PatientInstitutionResidence"
  },
  "00380500": {
    tag: "(0038,0500)",
    vr: "LO",
    vm: "1",
    name: "PatientState"
  },
  "00380502": {
    tag: "(0038,0502)",
    vr: "SQ",
    vm: "1",
    name: "PatientClinicalTrialParticipationSequence"
  },
  "00384000": {
    tag: "(0038,4000)",
    vr: "LT",
    vm: "1",
    name: "VisitComments"
  },
  "003A0004": {
    tag: "(003A,0004)",
    vr: "CS",
    vm: "1",
    name: "WaveformOriginality"
  },
  "003A0005": {
    tag: "(003A,0005)",
    vr: "US",
    vm: "1",
    name: "NumberOfWaveformChannels"
  },
  "003A0010": {
    tag: "(003A,0010)",
    vr: "UL",
    vm: "1",
    name: "NumberOfWaveformSamples"
  },
  "003A001A": {
    tag: "(003A,001A)",
    vr: "DS",
    vm: "1",
    name: "SamplingFrequency"
  },
  "003A0020": {
    tag: "(003A,0020)",
    vr: "SH",
    vm: "1",
    name: "MultiplexGroupLabel"
  },
  "003A0200": {
    tag: "(003A,0200)",
    vr: "SQ",
    vm: "1",
    name: "ChannelDefinitionSequence"
  },
  "003A0202": {
    tag: "(003A,0202)",
    vr: "IS",
    vm: "1",
    name: "WaveformChannelNumber"
  },
  "003A0203": {
    tag: "(003A,0203)",
    vr: "SH",
    vm: "1",
    name: "ChannelLabel"
  },
  "003A0205": {
    tag: "(003A,0205)",
    vr: "CS",
    vm: "1-n",
    name: "ChannelStatus"
  },
  "003A0208": {
    tag: "(003A,0208)",
    vr: "SQ",
    vm: "1",
    name: "ChannelSourceSequence"
  },
  "003A0209": {
    tag: "(003A,0209)",
    vr: "SQ",
    vm: "1",
    name: "ChannelSourceModifiersSequence"
  },
  "003A020A": {
    tag: "(003A,020A)",
    vr: "SQ",
    vm: "1",
    name: "SourceWaveformSequence"
  },
  "003A020C": {
    tag: "(003A,020C)",
    vr: "LO",
    vm: "1",
    name: "ChannelDerivationDescription"
  },
  "003A0210": {
    tag: "(003A,0210)",
    vr: "DS",
    vm: "1",
    name: "ChannelSensitivity"
  },
  "003A0211": {
    tag: "(003A,0211)",
    vr: "SQ",
    vm: "1",
    name: "ChannelSensitivityUnitsSequence"
  },
  "003A0212": {
    tag: "(003A,0212)",
    vr: "DS",
    vm: "1",
    name: "ChannelSensitivityCorrectionFactor"
  },
  "003A0213": {
    tag: "(003A,0213)",
    vr: "DS",
    vm: "1",
    name: "ChannelBaseline"
  },
  "003A0214": {
    tag: "(003A,0214)",
    vr: "DS",
    vm: "1",
    name: "ChannelTimeSkew"
  },
  "003A0215": {
    tag: "(003A,0215)",
    vr: "DS",
    vm: "1",
    name: "ChannelSampleSkew"
  },
  "003A0218": {
    tag: "(003A,0218)",
    vr: "DS",
    vm: "1",
    name: "ChannelOffset"
  },
  "003A021A": {
    tag: "(003A,021A)",
    vr: "US",
    vm: "1",
    name: "WaveformBitsStored"
  },
  "003A0220": {
    tag: "(003A,0220)",
    vr: "DS",
    vm: "1",
    name: "FilterLowFrequency"
  },
  "003A0221": {
    tag: "(003A,0221)",
    vr: "DS",
    vm: "1",
    name: "FilterHighFrequency"
  },
  "003A0222": {
    tag: "(003A,0222)",
    vr: "DS",
    vm: "1",
    name: "NotchFilterFrequency"
  },
  "003A0223": {
    tag: "(003A,0223)",
    vr: "DS",
    vm: "1",
    name: "NotchFilterBandwidth"
  },
  "003A0230": {
    tag: "(003A,0230)",
    vr: "FL",
    vm: "1",
    name: "WaveformDataDisplayScale"
  },
  "003A0231": {
    tag: "(003A,0231)",
    vr: "US",
    vm: "3",
    name: "WaveformDisplayBackgroundCIELabValue"
  },
  "003A0240": {
    tag: "(003A,0240)",
    vr: "SQ",
    vm: "1",
    name: "WaveformPresentationGroupSequence"
  },
  "003A0241": {
    tag: "(003A,0241)",
    vr: "US",
    vm: "1",
    name: "PresentationGroupNumber"
  },
  "003A0242": {
    tag: "(003A,0242)",
    vr: "SQ",
    vm: "1",
    name: "ChannelDisplaySequence"
  },
  "003A0244": {
    tag: "(003A,0244)",
    vr: "US",
    vm: "3",
    name: "ChannelRecommendedDisplayCIELabValue"
  },
  "003A0245": {
    tag: "(003A,0245)",
    vr: "FL",
    vm: "1",
    name: "ChannelPosition"
  },
  "003A0246": {
    tag: "(003A,0246)",
    vr: "CS",
    vm: "1",
    name: "DisplayShadingFlag"
  },
  "003A0247": {
    tag: "(003A,0247)",
    vr: "FL",
    vm: "1",
    name: "FractionalChannelDisplayScale"
  },
  "003A0248": {
    tag: "(003A,0248)",
    vr: "FL",
    vm: "1",
    name: "AbsoluteChannelDisplayScale"
  },
  "003A0300": {
    tag: "(003A,0300)",
    vr: "SQ",
    vm: "1",
    name: "MultiplexedAudioChannelsDescriptionCodeSequence"
  },
  "003A0301": {
    tag: "(003A,0301)",
    vr: "IS",
    vm: "1",
    name: "ChannelIdentificationCode"
  },
  "003A0302": {
    tag: "(003A,0302)",
    vr: "CS",
    vm: "1",
    name: "ChannelMode"
  },
  "00400001": {
    tag: "(0040,0001)",
    vr: "AE",
    vm: "1-n",
    name: "ScheduledStationAETitle"
  },
  "00400002": {
    tag: "(0040,0002)",
    vr: "DA",
    vm: "1",
    name: "ScheduledProcedureStepStartDate"
  },
  "00400003": {
    tag: "(0040,0003)",
    vr: "TM",
    vm: "1",
    name: "ScheduledProcedureStepStartTime"
  },
  "00400004": {
    tag: "(0040,0004)",
    vr: "DA",
    vm: "1",
    name: "ScheduledProcedureStepEndDate"
  },
  "00400005": {
    tag: "(0040,0005)",
    vr: "TM",
    vm: "1",
    name: "ScheduledProcedureStepEndTime"
  },
  "00400006": {
    tag: "(0040,0006)",
    vr: "PN",
    vm: "1",
    name: "ScheduledPerformingPhysicianName"
  },
  "00400007": {
    tag: "(0040,0007)",
    vr: "LO",
    vm: "1",
    name: "ScheduledProcedureStepDescription"
  },
  "00400008": {
    tag: "(0040,0008)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledProtocolCodeSequence"
  },
  "00400009": {
    tag: "(0040,0009)",
    vr: "SH",
    vm: "1",
    name: "ScheduledProcedureStepID"
  },
  "0040000A": {
    tag: "(0040,000A)",
    vr: "SQ",
    vm: "1",
    name: "StageCodeSequence"
  },
  "0040000B": {
    tag: "(0040,000B)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledPerformingPhysicianIdentificationSequence"
  },
  "00400010": {
    tag: "(0040,0010)",
    vr: "SH",
    vm: "1-n",
    name: "ScheduledStationName"
  },
  "00400011": {
    tag: "(0040,0011)",
    vr: "SH",
    vm: "1",
    name: "ScheduledProcedureStepLocation"
  },
  "00400012": {
    tag: "(0040,0012)",
    vr: "LO",
    vm: "1",
    name: "PreMedication"
  },
  "00400020": {
    tag: "(0040,0020)",
    vr: "CS",
    vm: "1",
    name: "ScheduledProcedureStepStatus"
  },
  "00400026": {
    tag: "(0040,0026)",
    vr: "SQ",
    vm: "1",
    name: "OrderPlacerIdentifierSequence"
  },
  "00400027": {
    tag: "(0040,0027)",
    vr: "SQ",
    vm: "1",
    name: "OrderFillerIdentifierSequence"
  },
  "00400031": {
    tag: "(0040,0031)",
    vr: "UT",
    vm: "1",
    name: "LocalNamespaceEntityID"
  },
  "00400032": {
    tag: "(0040,0032)",
    vr: "UT",
    vm: "1",
    name: "UniversalEntityID"
  },
  "00400033": {
    tag: "(0040,0033)",
    vr: "CS",
    vm: "1",
    name: "UniversalEntityIDType"
  },
  "00400035": {
    tag: "(0040,0035)",
    vr: "CS",
    vm: "1",
    name: "IdentifierTypeCode"
  },
  "00400036": {
    tag: "(0040,0036)",
    vr: "SQ",
    vm: "1",
    name: "AssigningFacilitySequence"
  },
  "00400039": {
    tag: "(0040,0039)",
    vr: "SQ",
    vm: "1",
    name: "AssigningJurisdictionCodeSequence"
  },
  "0040003A": {
    tag: "(0040,003A)",
    vr: "SQ",
    vm: "1",
    name: "AssigningAgencyOrDepartmentCodeSequence"
  },
  "00400100": {
    tag: "(0040,0100)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledProcedureStepSequence"
  },
  "00400220": {
    tag: "(0040,0220)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedNonImageCompositeSOPInstanceSequence"
  },
  "00400241": {
    tag: "(0040,0241)",
    vr: "AE",
    vm: "1",
    name: "PerformedStationAETitle"
  },
  "00400242": {
    tag: "(0040,0242)",
    vr: "SH",
    vm: "1",
    name: "PerformedStationName"
  },
  "00400243": {
    tag: "(0040,0243)",
    vr: "SH",
    vm: "1",
    name: "PerformedLocation"
  },
  "00400244": {
    tag: "(0040,0244)",
    vr: "DA",
    vm: "1",
    name: "PerformedProcedureStepStartDate"
  },
  "00400245": {
    tag: "(0040,0245)",
    vr: "TM",
    vm: "1",
    name: "PerformedProcedureStepStartTime"
  },
  "00400250": {
    tag: "(0040,0250)",
    vr: "DA",
    vm: "1",
    name: "PerformedProcedureStepEndDate"
  },
  "00400251": {
    tag: "(0040,0251)",
    vr: "TM",
    vm: "1",
    name: "PerformedProcedureStepEndTime"
  },
  "00400252": {
    tag: "(0040,0252)",
    vr: "CS",
    vm: "1",
    name: "PerformedProcedureStepStatus"
  },
  "00400253": {
    tag: "(0040,0253)",
    vr: "SH",
    vm: "1",
    name: "PerformedProcedureStepID"
  },
  "00400254": {
    tag: "(0040,0254)",
    vr: "LO",
    vm: "1",
    name: "PerformedProcedureStepDescription"
  },
  "00400255": {
    tag: "(0040,0255)",
    vr: "LO",
    vm: "1",
    name: "PerformedProcedureTypeDescription"
  },
  "00400260": {
    tag: "(0040,0260)",
    vr: "SQ",
    vm: "1",
    name: "PerformedProtocolCodeSequence"
  },
  "00400261": {
    tag: "(0040,0261)",
    vr: "CS",
    vm: "1",
    name: "PerformedProtocolType"
  },
  "00400270": {
    tag: "(0040,0270)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledStepAttributesSequence"
  },
  "00400275": {
    tag: "(0040,0275)",
    vr: "SQ",
    vm: "1",
    name: "RequestAttributesSequence"
  },
  "00400280": {
    tag: "(0040,0280)",
    vr: "ST",
    vm: "1",
    name: "CommentsOnThePerformedProcedureStep"
  },
  "00400281": {
    tag: "(0040,0281)",
    vr: "SQ",
    vm: "1",
    name: "PerformedProcedureStepDiscontinuationReasonCodeSequence"
  },
  "00400293": {
    tag: "(0040,0293)",
    vr: "SQ",
    vm: "1",
    name: "QuantitySequence"
  },
  "00400294": {
    tag: "(0040,0294)",
    vr: "DS",
    vm: "1",
    name: "Quantity"
  },
  "00400295": {
    tag: "(0040,0295)",
    vr: "SQ",
    vm: "1",
    name: "MeasuringUnitsSequence"
  },
  "00400296": {
    tag: "(0040,0296)",
    vr: "SQ",
    vm: "1",
    name: "BillingItemSequence"
  },
  "00400300": {
    tag: "(0040,0300)",
    vr: "US",
    vm: "1",
    name: "TotalTimeOfFluoroscopy"
  },
  "00400301": {
    tag: "(0040,0301)",
    vr: "US",
    vm: "1",
    name: "TotalNumberOfExposures"
  },
  "00400302": {
    tag: "(0040,0302)",
    vr: "US",
    vm: "1",
    name: "EntranceDose"
  },
  "00400303": {
    tag: "(0040,0303)",
    vr: "US",
    vm: "1-2",
    name: "ExposedArea"
  },
  "00400306": {
    tag: "(0040,0306)",
    vr: "DS",
    vm: "1",
    name: "DistanceSourceToEntrance"
  },
  "00400307": {
    tag: "(0040,0307)",
    vr: "DS",
    vm: "1",
    name: "DistanceSourceToSupport"
  },
  "0040030E": {
    tag: "(0040,030E)",
    vr: "SQ",
    vm: "1",
    name: "ExposureDoseSequence"
  },
  "00400310": {
    tag: "(0040,0310)",
    vr: "ST",
    vm: "1",
    name: "CommentsOnRadiationDose"
  },
  "00400312": {
    tag: "(0040,0312)",
    vr: "DS",
    vm: "1",
    name: "XRayOutput"
  },
  "00400314": {
    tag: "(0040,0314)",
    vr: "DS",
    vm: "1",
    name: "HalfValueLayer"
  },
  "00400316": {
    tag: "(0040,0316)",
    vr: "DS",
    vm: "1",
    name: "OrganDose"
  },
  "00400318": {
    tag: "(0040,0318)",
    vr: "CS",
    vm: "1",
    name: "OrganExposed"
  },
  "00400320": {
    tag: "(0040,0320)",
    vr: "SQ",
    vm: "1",
    name: "BillingProcedureStepSequence"
  },
  "00400321": {
    tag: "(0040,0321)",
    vr: "SQ",
    vm: "1",
    name: "FilmConsumptionSequence"
  },
  "00400324": {
    tag: "(0040,0324)",
    vr: "SQ",
    vm: "1",
    name: "BillingSuppliesAndDevicesSequence"
  },
  "00400330": {
    tag: "(0040,0330)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedProcedureStepSequence"
  },
  "00400340": {
    tag: "(0040,0340)",
    vr: "SQ",
    vm: "1",
    name: "PerformedSeriesSequence"
  },
  "00400400": {
    tag: "(0040,0400)",
    vr: "LT",
    vm: "1",
    name: "CommentsOnTheScheduledProcedureStep"
  },
  "00400440": {
    tag: "(0040,0440)",
    vr: "SQ",
    vm: "1",
    name: "ProtocolContextSequence"
  },
  "00400441": {
    tag: "(0040,0441)",
    vr: "SQ",
    vm: "1",
    name: "ContentItemModifierSequence"
  },
  "00400500": {
    tag: "(0040,0500)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledSpecimenSequence"
  },
  "0040050A": {
    tag: "(0040,050A)",
    vr: "LO",
    vm: "1",
    name: "SpecimenAccessionNumber"
  },
  "00400512": {
    tag: "(0040,0512)",
    vr: "LO",
    vm: "1",
    name: "ContainerIdentifier"
  },
  "00400513": {
    tag: "(0040,0513)",
    vr: "SQ",
    vm: "1",
    name: "IssuerOfTheContainerIdentifierSequence"
  },
  "00400515": {
    tag: "(0040,0515)",
    vr: "SQ",
    vm: "1",
    name: "AlternateContainerIdentifierSequence"
  },
  "00400518": {
    tag: "(0040,0518)",
    vr: "SQ",
    vm: "1",
    name: "ContainerTypeCodeSequence"
  },
  "0040051A": {
    tag: "(0040,051A)",
    vr: "LO",
    vm: "1",
    name: "ContainerDescription"
  },
  "00400520": {
    tag: "(0040,0520)",
    vr: "SQ",
    vm: "1",
    name: "ContainerComponentSequence"
  },
  "00400550": {
    tag: "(0040,0550)",
    vr: "SQ",
    vm: "1",
    name: "SpecimenSequence"
  },
  "00400551": {
    tag: "(0040,0551)",
    vr: "LO",
    vm: "1",
    name: "SpecimenIdentifier"
  },
  "00400552": {
    tag: "(0040,0552)",
    vr: "SQ",
    vm: "1",
    name: "SpecimenDescriptionSequenceTrial"
  },
  "00400553": {
    tag: "(0040,0553)",
    vr: "ST",
    vm: "1",
    name: "SpecimenDescriptionTrial"
  },
  "00400554": {
    tag: "(0040,0554)",
    vr: "UI",
    vm: "1",
    name: "SpecimenUID"
  },
  "00400555": {
    tag: "(0040,0555)",
    vr: "SQ",
    vm: "1",
    name: "AcquisitionContextSequence"
  },
  "00400556": {
    tag: "(0040,0556)",
    vr: "ST",
    vm: "1",
    name: "AcquisitionContextDescription"
  },
  "0040059A": {
    tag: "(0040,059A)",
    vr: "SQ",
    vm: "1",
    name: "SpecimenTypeCodeSequence"
  },
  "00400560": {
    tag: "(0040,0560)",
    vr: "SQ",
    vm: "1",
    name: "SpecimenDescriptionSequence"
  },
  "00400562": {
    tag: "(0040,0562)",
    vr: "SQ",
    vm: "1",
    name: "IssuerOfTheSpecimenIdentifierSequence"
  },
  "00400600": {
    tag: "(0040,0600)",
    vr: "LO",
    vm: "1",
    name: "SpecimenShortDescription"
  },
  "00400602": {
    tag: "(0040,0602)",
    vr: "UT",
    vm: "1",
    name: "SpecimenDetailedDescription"
  },
  "00400610": {
    tag: "(0040,0610)",
    vr: "SQ",
    vm: "1",
    name: "SpecimenPreparationSequence"
  },
  "00400612": {
    tag: "(0040,0612)",
    vr: "SQ",
    vm: "1",
    name: "SpecimenPreparationStepContentItemSequence"
  },
  "00400620": {
    tag: "(0040,0620)",
    vr: "SQ",
    vm: "1",
    name: "SpecimenLocalizationContentItemSequence"
  },
  "004006FA": {
    tag: "(0040,06FA)",
    vr: "LO",
    vm: "1",
    name: "SlideIdentifier"
  },
  "00400710": {
    tag: "(0040,0710)",
    vr: "SQ",
    vm: "1",
    name: "WholeSlideMicroscopyImageFrameTypeSequence"
  },
  "0040071A": {
    tag: "(0040,071A)",
    vr: "SQ",
    vm: "1",
    name: "ImageCenterPointCoordinatesSequence"
  },
  "0040072A": {
    tag: "(0040,072A)",
    vr: "DS",
    vm: "1",
    name: "XOffsetInSlideCoordinateSystem"
  },
  "0040073A": {
    tag: "(0040,073A)",
    vr: "DS",
    vm: "1",
    name: "YOffsetInSlideCoordinateSystem"
  },
  "0040074A": {
    tag: "(0040,074A)",
    vr: "DS",
    vm: "1",
    name: "ZOffsetInSlideCoordinateSystem"
  },
  "004008D8": {
    tag: "(0040,08D8)",
    vr: "SQ",
    vm: "1",
    name: "PixelSpacingSequence"
  },
  "004008DA": {
    tag: "(0040,08DA)",
    vr: "SQ",
    vm: "1",
    name: "CoordinateSystemAxisCodeSequence"
  },
  "004008EA": {
    tag: "(0040,08EA)",
    vr: "SQ",
    vm: "1",
    name: "MeasurementUnitsCodeSequence"
  },
  "004009F8": {
    tag: "(0040,09F8)",
    vr: "SQ",
    vm: "1",
    name: "VitalStainCodeSequenceTrial"
  },
  "00401001": {
    tag: "(0040,1001)",
    vr: "SH",
    vm: "1",
    name: "RequestedProcedureID"
  },
  "00401002": {
    tag: "(0040,1002)",
    vr: "LO",
    vm: "1",
    name: "ReasonForTheRequestedProcedure"
  },
  "00401003": {
    tag: "(0040,1003)",
    vr: "SH",
    vm: "1",
    name: "RequestedProcedurePriority"
  },
  "00401004": {
    tag: "(0040,1004)",
    vr: "LO",
    vm: "1",
    name: "PatientTransportArrangements"
  },
  "00401005": {
    tag: "(0040,1005)",
    vr: "LO",
    vm: "1",
    name: "RequestedProcedureLocation"
  },
  "00401006": {
    tag: "(0040,1006)",
    vr: "SH",
    vm: "1",
    name: "PlacerOrderNumberProcedure"
  },
  "00401007": {
    tag: "(0040,1007)",
    vr: "SH",
    vm: "1",
    name: "FillerOrderNumberProcedure"
  },
  "00401008": {
    tag: "(0040,1008)",
    vr: "LO",
    vm: "1",
    name: "ConfidentialityCode"
  },
  "00401009": {
    tag: "(0040,1009)",
    vr: "SH",
    vm: "1",
    name: "ReportingPriority"
  },
  "0040100A": {
    tag: "(0040,100A)",
    vr: "SQ",
    vm: "1",
    name: "ReasonForRequestedProcedureCodeSequence"
  },
  "00401010": {
    tag: "(0040,1010)",
    vr: "PN",
    vm: "1-n",
    name: "NamesOfIntendedRecipientsOfResults"
  },
  "00401011": {
    tag: "(0040,1011)",
    vr: "SQ",
    vm: "1",
    name: "IntendedRecipientsOfResultsIdentificationSequence"
  },
  "00401012": {
    tag: "(0040,1012)",
    vr: "SQ",
    vm: "1",
    name: "ReasonForPerformedProcedureCodeSequence"
  },
  "00401060": {
    tag: "(0040,1060)",
    vr: "LO",
    vm: "1",
    name: "RequestedProcedureDescriptionTrial"
  },
  "00401101": {
    tag: "(0040,1101)",
    vr: "SQ",
    vm: "1",
    name: "PersonIdentificationCodeSequence"
  },
  "00401102": {
    tag: "(0040,1102)",
    vr: "ST",
    vm: "1",
    name: "PersonAddress"
  },
  "00401103": {
    tag: "(0040,1103)",
    vr: "LO",
    vm: "1-n",
    name: "PersonTelephoneNumbers"
  },
  "00401104": {
    tag: "(0040,1104)",
    vr: "LT",
    vm: "1",
    name: "PersonTelecomInformation"
  },
  "00401400": {
    tag: "(0040,1400)",
    vr: "LT",
    vm: "1",
    name: "RequestedProcedureComments"
  },
  "00402001": {
    tag: "(0040,2001)",
    vr: "LO",
    vm: "1",
    name: "ReasonForTheImagingServiceRequest"
  },
  "00402004": {
    tag: "(0040,2004)",
    vr: "DA",
    vm: "1",
    name: "IssueDateOfImagingServiceRequest"
  },
  "00402005": {
    tag: "(0040,2005)",
    vr: "TM",
    vm: "1",
    name: "IssueTimeOfImagingServiceRequest"
  },
  "00402006": {
    tag: "(0040,2006)",
    vr: "SH",
    vm: "1",
    name: "PlacerOrderNumberImagingServiceRequestRetired"
  },
  "00402007": {
    tag: "(0040,2007)",
    vr: "SH",
    vm: "1",
    name: "FillerOrderNumberImagingServiceRequestRetired"
  },
  "00402008": {
    tag: "(0040,2008)",
    vr: "PN",
    vm: "1",
    name: "OrderEnteredBy"
  },
  "00402009": {
    tag: "(0040,2009)",
    vr: "SH",
    vm: "1",
    name: "OrderEntererLocation"
  },
  "00402010": {
    tag: "(0040,2010)",
    vr: "SH",
    vm: "1",
    name: "OrderCallbackPhoneNumber"
  },
  "00402011": {
    tag: "(0040,2011)",
    vr: "LT",
    vm: "1",
    name: "OrderCallbackTelecomInformation"
  },
  "00402016": {
    tag: "(0040,2016)",
    vr: "LO",
    vm: "1",
    name: "PlacerOrderNumberImagingServiceRequest"
  },
  "00402017": {
    tag: "(0040,2017)",
    vr: "LO",
    vm: "1",
    name: "FillerOrderNumberImagingServiceRequest"
  },
  "00402400": {
    tag: "(0040,2400)",
    vr: "LT",
    vm: "1",
    name: "ImagingServiceRequestComments"
  },
  "00403001": {
    tag: "(0040,3001)",
    vr: "LO",
    vm: "1",
    name: "ConfidentialityConstraintOnPatientDataDescription"
  },
  "00404001": {
    tag: "(0040,4001)",
    vr: "CS",
    vm: "1",
    name: "GeneralPurposeScheduledProcedureStepStatus"
  },
  "00404002": {
    tag: "(0040,4002)",
    vr: "CS",
    vm: "1",
    name: "GeneralPurposePerformedProcedureStepStatus"
  },
  "00404003": {
    tag: "(0040,4003)",
    vr: "CS",
    vm: "1",
    name: "GeneralPurposeScheduledProcedureStepPriority"
  },
  "00404004": {
    tag: "(0040,4004)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledProcessingApplicationsCodeSequence"
  },
  "00404005": {
    tag: "(0040,4005)",
    vr: "DT",
    vm: "1",
    name: "ScheduledProcedureStepStartDateTime"
  },
  "00404006": {
    tag: "(0040,4006)",
    vr: "CS",
    vm: "1",
    name: "MultipleCopiesFlag"
  },
  "00404007": {
    tag: "(0040,4007)",
    vr: "SQ",
    vm: "1",
    name: "PerformedProcessingApplicationsCodeSequence"
  },
  "00404008": {
    tag: "(0040,4008)",
    vr: "DT",
    vm: "1",
    name: "ScheduledProcedureStepExpirationDateTime"
  },
  "00404009": {
    tag: "(0040,4009)",
    vr: "SQ",
    vm: "1",
    name: "HumanPerformerCodeSequence"
  },
  "00404010": {
    tag: "(0040,4010)",
    vr: "DT",
    vm: "1",
    name: "ScheduledProcedureStepModificationDateTime"
  },
  "00404011": {
    tag: "(0040,4011)",
    vr: "DT",
    vm: "1",
    name: "ExpectedCompletionDateTime"
  },
  "00404015": {
    tag: "(0040,4015)",
    vr: "SQ",
    vm: "1",
    name: "ResultingGeneralPurposePerformedProcedureStepsSequence"
  },
  "00404016": {
    tag: "(0040,4016)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedGeneralPurposeScheduledProcedureStepSequence"
  },
  "00404018": {
    tag: "(0040,4018)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledWorkitemCodeSequence"
  },
  "00404019": {
    tag: "(0040,4019)",
    vr: "SQ",
    vm: "1",
    name: "PerformedWorkitemCodeSequence"
  },
  "00404020": {
    tag: "(0040,4020)",
    vr: "CS",
    vm: "1",
    name: "InputAvailabilityFlag"
  },
  "00404021": {
    tag: "(0040,4021)",
    vr: "SQ",
    vm: "1",
    name: "InputInformationSequence"
  },
  "00404022": {
    tag: "(0040,4022)",
    vr: "SQ",
    vm: "1",
    name: "RelevantInformationSequence"
  },
  "00404023": {
    tag: "(0040,4023)",
    vr: "UI",
    vm: "1",
    name: "ReferencedGeneralPurposeScheduledProcedureStepTransactionUID"
  },
  "00404025": {
    tag: "(0040,4025)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledStationNameCodeSequence"
  },
  "00404026": {
    tag: "(0040,4026)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledStationClassCodeSequence"
  },
  "00404027": {
    tag: "(0040,4027)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledStationGeographicLocationCodeSequence"
  },
  "00404028": {
    tag: "(0040,4028)",
    vr: "SQ",
    vm: "1",
    name: "PerformedStationNameCodeSequence"
  },
  "00404029": {
    tag: "(0040,4029)",
    vr: "SQ",
    vm: "1",
    name: "PerformedStationClassCodeSequence"
  },
  "00404030": {
    tag: "(0040,4030)",
    vr: "SQ",
    vm: "1",
    name: "PerformedStationGeographicLocationCodeSequence"
  },
  "00404031": {
    tag: "(0040,4031)",
    vr: "SQ",
    vm: "1",
    name: "RequestedSubsequentWorkitemCodeSequence"
  },
  "00404032": {
    tag: "(0040,4032)",
    vr: "SQ",
    vm: "1",
    name: "NonDICOMOutputCodeSequence"
  },
  "00404033": {
    tag: "(0040,4033)",
    vr: "SQ",
    vm: "1",
    name: "OutputInformationSequence"
  },
  "00404034": {
    tag: "(0040,4034)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledHumanPerformersSequence"
  },
  "00404035": {
    tag: "(0040,4035)",
    vr: "SQ",
    vm: "1",
    name: "ActualHumanPerformersSequence"
  },
  "00404036": {
    tag: "(0040,4036)",
    vr: "LO",
    vm: "1",
    name: "HumanPerformerOrganization"
  },
  "00404037": {
    tag: "(0040,4037)",
    vr: "PN",
    vm: "1",
    name: "HumanPerformerName"
  },
  "00404040": {
    tag: "(0040,4040)",
    vr: "CS",
    vm: "1",
    name: "RawDataHandling"
  },
  "00404041": {
    tag: "(0040,4041)",
    vr: "CS",
    vm: "1",
    name: "InputReadinessState"
  },
  "00404050": {
    tag: "(0040,4050)",
    vr: "DT",
    vm: "1",
    name: "PerformedProcedureStepStartDateTime"
  },
  "00404051": {
    tag: "(0040,4051)",
    vr: "DT",
    vm: "1",
    name: "PerformedProcedureStepEndDateTime"
  },
  "00404052": {
    tag: "(0040,4052)",
    vr: "DT",
    vm: "1",
    name: "ProcedureStepCancellationDateTime"
  },
  "00404070": {
    tag: "(0040,4070)",
    vr: "SQ",
    vm: "1",
    name: "OutputDestinationSequence"
  },
  "00404071": {
    tag: "(0040,4071)",
    vr: "SQ",
    vm: "1",
    name: "DICOMStorageSequence"
  },
  "00404072": {
    tag: "(0040,4072)",
    vr: "SQ",
    vm: "1",
    name: "STOWRSStorageSequence"
  },
  "00404073": {
    tag: "(0040,4073)",
    vr: "UR",
    vm: "1",
    name: "StorageURL"
  },
  "00404074": {
    tag: "(0040,4074)",
    vr: "SQ",
    vm: "1",
    name: "XDSStorageSequence"
  },
  "00408302": {
    tag: "(0040,8302)",
    vr: "DS",
    vm: "1",
    name: "EntranceDoseInmGy"
  },
  "00408303": {
    tag: "(0040,8303)",
    vr: "CS",
    vm: "1",
    name: "EntranceDoseDerivation"
  },
  "00409092": {
    tag: "(0040,9092)",
    vr: "SQ",
    vm: "1",
    name: "ParametricMapFrameTypeSequence"
  },
  "00409094": {
    tag: "(0040,9094)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedImageRealWorldValueMappingSequence"
  },
  "00409096": {
    tag: "(0040,9096)",
    vr: "SQ",
    vm: "1",
    name: "RealWorldValueMappingSequence"
  },
  "00409098": {
    tag: "(0040,9098)",
    vr: "SQ",
    vm: "1",
    name: "PixelValueMappingCodeSequence"
  },
  "00409210": {
    tag: "(0040,9210)",
    vr: "SH",
    vm: "1",
    name: "LUTLabel"
  },
  "00409211": {
    tag: "(0040,9211)",
    vr: "US|SS",
    vm: "1",
    name: "RealWorldValueLastValueMapped"
  },
  "00409212": {
    tag: "(0040,9212)",
    vr: "FD",
    vm: "1-n",
    name: "RealWorldValueLUTData"
  },
  "00409213": {
    tag: "(0040,9213)",
    vr: "FD",
    vm: "1",
    name: "DoubleFloatRealWorldValueLastValueMapped"
  },
  "00409214": {
    tag: "(0040,9214)",
    vr: "FD",
    vm: "1",
    name: "DoubleFloatRealWorldValueFirstValueMapped"
  },
  "00409216": {
    tag: "(0040,9216)",
    vr: "US|SS",
    vm: "1",
    name: "RealWorldValueFirstValueMapped"
  },
  "00409220": {
    tag: "(0040,9220)",
    vr: "SQ",
    vm: "1",
    name: "QuantityDefinitionSequence"
  },
  "00409224": {
    tag: "(0040,9224)",
    vr: "FD",
    vm: "1",
    name: "RealWorldValueIntercept"
  },
  "00409225": {
    tag: "(0040,9225)",
    vr: "FD",
    vm: "1",
    name: "RealWorldValueSlope"
  },
  "0040A007": {
    tag: "(0040,A007)",
    vr: "CS",
    vm: "1",
    name: "FindingsFlagTrial"
  },
  "0040A010": {
    tag: "(0040,A010)",
    vr: "CS",
    vm: "1",
    name: "RelationshipType"
  },
  "0040A020": {
    tag: "(0040,A020)",
    vr: "SQ",
    vm: "1",
    name: "FindingsSequenceTrial"
  },
  "0040A021": {
    tag: "(0040,A021)",
    vr: "UI",
    vm: "1",
    name: "FindingsGroupUIDTrial"
  },
  "0040A022": {
    tag: "(0040,A022)",
    vr: "UI",
    vm: "1",
    name: "ReferencedFindingsGroupUIDTrial"
  },
  "0040A023": {
    tag: "(0040,A023)",
    vr: "DA",
    vm: "1",
    name: "FindingsGroupRecordingDateTrial"
  },
  "0040A024": {
    tag: "(0040,A024)",
    vr: "TM",
    vm: "1",
    name: "FindingsGroupRecordingTimeTrial"
  },
  "0040A026": {
    tag: "(0040,A026)",
    vr: "SQ",
    vm: "1",
    name: "FindingsSourceCategoryCodeSequenceTrial"
  },
  "0040A027": {
    tag: "(0040,A027)",
    vr: "LO",
    vm: "1",
    name: "VerifyingOrganization"
  },
  "0040A028": {
    tag: "(0040,A028)",
    vr: "SQ",
    vm: "1",
    name: "DocumentingOrganizationIdentifierCodeSequenceTrial"
  },
  "0040A030": {
    tag: "(0040,A030)",
    vr: "DT",
    vm: "1",
    name: "VerificationDateTime"
  },
  "0040A032": {
    tag: "(0040,A032)",
    vr: "DT",
    vm: "1",
    name: "ObservationDateTime"
  },
  "0040A040": {
    tag: "(0040,A040)",
    vr: "CS",
    vm: "1",
    name: "ValueType"
  },
  "0040A043": {
    tag: "(0040,A043)",
    vr: "SQ",
    vm: "1",
    name: "ConceptNameCodeSequence"
  },
  "0040A047": {
    tag: "(0040,A047)",
    vr: "LO",
    vm: "1",
    name: "MeasurementPrecisionDescriptionTrial"
  },
  "0040A050": {
    tag: "(0040,A050)",
    vr: "CS",
    vm: "1",
    name: "ContinuityOfContent"
  },
  "0040A057": {
    tag: "(0040,A057)",
    vr: "CS",
    vm: "1-n",
    name: "UrgencyOrPriorityAlertsTrial"
  },
  "0040A060": {
    tag: "(0040,A060)",
    vr: "LO",
    vm: "1",
    name: "SequencingIndicatorTrial"
  },
  "0040A066": {
    tag: "(0040,A066)",
    vr: "SQ",
    vm: "1",
    name: "DocumentIdentifierCodeSequenceTrial"
  },
  "0040A067": {
    tag: "(0040,A067)",
    vr: "PN",
    vm: "1",
    name: "DocumentAuthorTrial"
  },
  "0040A068": {
    tag: "(0040,A068)",
    vr: "SQ",
    vm: "1",
    name: "DocumentAuthorIdentifierCodeSequenceTrial"
  },
  "0040A070": {
    tag: "(0040,A070)",
    vr: "SQ",
    vm: "1",
    name: "IdentifierCodeSequenceTrial"
  },
  "0040A073": {
    tag: "(0040,A073)",
    vr: "SQ",
    vm: "1",
    name: "VerifyingObserverSequence"
  },
  "0040A074": {
    tag: "(0040,A074)",
    vr: "OB",
    vm: "1",
    name: "ObjectBinaryIdentifierTrial"
  },
  "0040A075": {
    tag: "(0040,A075)",
    vr: "PN",
    vm: "1",
    name: "VerifyingObserverName"
  },
  "0040A076": {
    tag: "(0040,A076)",
    vr: "SQ",
    vm: "1",
    name: "DocumentingObserverIdentifierCodeSequenceTrial"
  },
  "0040A078": {
    tag: "(0040,A078)",
    vr: "SQ",
    vm: "1",
    name: "AuthorObserverSequence"
  },
  "0040A07A": {
    tag: "(0040,A07A)",
    vr: "SQ",
    vm: "1",
    name: "ParticipantSequence"
  },
  "0040A07C": {
    tag: "(0040,A07C)",
    vr: "SQ",
    vm: "1",
    name: "CustodialOrganizationSequence"
  },
  "0040A080": {
    tag: "(0040,A080)",
    vr: "CS",
    vm: "1",
    name: "ParticipationType"
  },
  "0040A082": {
    tag: "(0040,A082)",
    vr: "DT",
    vm: "1",
    name: "ParticipationDateTime"
  },
  "0040A084": {
    tag: "(0040,A084)",
    vr: "CS",
    vm: "1",
    name: "ObserverType"
  },
  "0040A085": {
    tag: "(0040,A085)",
    vr: "SQ",
    vm: "1",
    name: "ProcedureIdentifierCodeSequenceTrial"
  },
  "0040A088": {
    tag: "(0040,A088)",
    vr: "SQ",
    vm: "1",
    name: "VerifyingObserverIdentificationCodeSequence"
  },
  "0040A089": {
    tag: "(0040,A089)",
    vr: "OB",
    vm: "1",
    name: "ObjectDirectoryBinaryIdentifierTrial"
  },
  "0040A090": {
    tag: "(0040,A090)",
    vr: "SQ",
    vm: "1",
    name: "EquivalentCDADocumentSequence"
  },
  "0040A0B0": {
    tag: "(0040,A0B0)",
    vr: "US",
    vm: "2-2n",
    name: "ReferencedWaveformChannels"
  },
  "0040A110": {
    tag: "(0040,A110)",
    vr: "DA",
    vm: "1",
    name: "DateOfDocumentOrVerbalTransactionTrial"
  },
  "0040A112": {
    tag: "(0040,A112)",
    vr: "TM",
    vm: "1",
    name: "TimeOfDocumentCreationOrVerbalTransactionTrial"
  },
  "0040A120": {
    tag: "(0040,A120)",
    vr: "DT",
    vm: "1",
    name: "DateTime"
  },
  "0040A121": {
    tag: "(0040,A121)",
    vr: "DA",
    vm: "1",
    name: "Date"
  },
  "0040A122": {
    tag: "(0040,A122)",
    vr: "TM",
    vm: "1",
    name: "Time"
  },
  "0040A123": {
    tag: "(0040,A123)",
    vr: "PN",
    vm: "1",
    name: "PersonName"
  },
  "0040A124": {
    tag: "(0040,A124)",
    vr: "UI",
    vm: "1",
    name: "UID"
  },
  "0040A125": {
    tag: "(0040,A125)",
    vr: "CS",
    vm: "2",
    name: "ReportStatusIDTrial"
  },
  "0040A130": {
    tag: "(0040,A130)",
    vr: "CS",
    vm: "1",
    name: "TemporalRangeType"
  },
  "0040A132": {
    tag: "(0040,A132)",
    vr: "UL",
    vm: "1-n",
    name: "ReferencedSamplePositions"
  },
  "0040A136": {
    tag: "(0040,A136)",
    vr: "US",
    vm: "1-n",
    name: "ReferencedFrameNumbers"
  },
  "0040A138": {
    tag: "(0040,A138)",
    vr: "DS",
    vm: "1-n",
    name: "ReferencedTimeOffsets"
  },
  "0040A13A": {
    tag: "(0040,A13A)",
    vr: "DT",
    vm: "1-n",
    name: "ReferencedDateTime"
  },
  "0040A160": {
    tag: "(0040,A160)",
    vr: "UT",
    vm: "1",
    name: "TextValue"
  },
  "0040A161": {
    tag: "(0040,A161)",
    vr: "FD",
    vm: "1-n",
    name: "FloatingPointValue"
  },
  "0040A162": {
    tag: "(0040,A162)",
    vr: "SL",
    vm: "1-n",
    name: "RationalNumeratorValue"
  },
  "0040A163": {
    tag: "(0040,A163)",
    vr: "UL",
    vm: "1-n",
    name: "RationalDenominatorValue"
  },
  "0040A167": {
    tag: "(0040,A167)",
    vr: "SQ",
    vm: "1",
    name: "ObservationCategoryCodeSequenceTrial"
  },
  "0040A168": {
    tag: "(0040,A168)",
    vr: "SQ",
    vm: "1",
    name: "ConceptCodeSequence"
  },
  "0040A16A": {
    tag: "(0040,A16A)",
    vr: "ST",
    vm: "1",
    name: "BibliographicCitationTrial"
  },
  "0040A170": {
    tag: "(0040,A170)",
    vr: "SQ",
    vm: "1",
    name: "PurposeOfReferenceCodeSequence"
  },
  "0040A171": {
    tag: "(0040,A171)",
    vr: "UI",
    vm: "1",
    name: "ObservationUID"
  },
  "0040A172": {
    tag: "(0040,A172)",
    vr: "UI",
    vm: "1",
    name: "ReferencedObservationUIDTrial"
  },
  "0040A173": {
    tag: "(0040,A173)",
    vr: "CS",
    vm: "1",
    name: "ReferencedObservationClassTrial"
  },
  "0040A174": {
    tag: "(0040,A174)",
    vr: "CS",
    vm: "1",
    name: "ReferencedObjectObservationClassTrial"
  },
  "0040A180": {
    tag: "(0040,A180)",
    vr: "US",
    vm: "1",
    name: "AnnotationGroupNumber"
  },
  "0040A192": {
    tag: "(0040,A192)",
    vr: "DA",
    vm: "1",
    name: "ObservationDateTrial"
  },
  "0040A193": {
    tag: "(0040,A193)",
    vr: "TM",
    vm: "1",
    name: "ObservationTimeTrial"
  },
  "0040A194": {
    tag: "(0040,A194)",
    vr: "CS",
    vm: "1",
    name: "MeasurementAutomationTrial"
  },
  "0040A195": {
    tag: "(0040,A195)",
    vr: "SQ",
    vm: "1",
    name: "ModifierCodeSequence"
  },
  "0040A224": {
    tag: "(0040,A224)",
    vr: "ST",
    vm: "1",
    name: "IdentificationDescriptionTrial"
  },
  "0040A290": {
    tag: "(0040,A290)",
    vr: "CS",
    vm: "1",
    name: "CoordinatesSetGeometricTypeTrial"
  },
  "0040A296": {
    tag: "(0040,A296)",
    vr: "SQ",
    vm: "1",
    name: "AlgorithmCodeSequenceTrial"
  },
  "0040A297": {
    tag: "(0040,A297)",
    vr: "ST",
    vm: "1",
    name: "AlgorithmDescriptionTrial"
  },
  "0040A29A": {
    tag: "(0040,A29A)",
    vr: "SL",
    vm: "2-2n",
    name: "PixelCoordinatesSetTrial"
  },
  "0040A300": {
    tag: "(0040,A300)",
    vr: "SQ",
    vm: "1",
    name: "MeasuredValueSequence"
  },
  "0040A301": {
    tag: "(0040,A301)",
    vr: "SQ",
    vm: "1",
    name: "NumericValueQualifierCodeSequence"
  },
  "0040A307": {
    tag: "(0040,A307)",
    vr: "PN",
    vm: "1",
    name: "CurrentObserverTrial"
  },
  "0040A30A": {
    tag: "(0040,A30A)",
    vr: "DS",
    vm: "1-n",
    name: "NumericValue"
  },
  "0040A313": {
    tag: "(0040,A313)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedAccessionSequenceTrial"
  },
  "0040A33A": {
    tag: "(0040,A33A)",
    vr: "ST",
    vm: "1",
    name: "ReportStatusCommentTrial"
  },
  "0040A340": {
    tag: "(0040,A340)",
    vr: "SQ",
    vm: "1",
    name: "ProcedureContextSequenceTrial"
  },
  "0040A352": {
    tag: "(0040,A352)",
    vr: "PN",
    vm: "1",
    name: "VerbalSourceTrial"
  },
  "0040A353": {
    tag: "(0040,A353)",
    vr: "ST",
    vm: "1",
    name: "AddressTrial"
  },
  "0040A354": {
    tag: "(0040,A354)",
    vr: "LO",
    vm: "1",
    name: "TelephoneNumberTrial"
  },
  "0040A358": {
    tag: "(0040,A358)",
    vr: "SQ",
    vm: "1",
    name: "VerbalSourceIdentifierCodeSequenceTrial"
  },
  "0040A360": {
    tag: "(0040,A360)",
    vr: "SQ",
    vm: "1",
    name: "PredecessorDocumentsSequence"
  },
  "0040A370": {
    tag: "(0040,A370)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedRequestSequence"
  },
  "0040A372": {
    tag: "(0040,A372)",
    vr: "SQ",
    vm: "1",
    name: "PerformedProcedureCodeSequence"
  },
  "0040A375": {
    tag: "(0040,A375)",
    vr: "SQ",
    vm: "1",
    name: "CurrentRequestedProcedureEvidenceSequence"
  },
  "0040A380": {
    tag: "(0040,A380)",
    vr: "SQ",
    vm: "1",
    name: "ReportDetailSequenceTrial"
  },
  "0040A385": {
    tag: "(0040,A385)",
    vr: "SQ",
    vm: "1",
    name: "PertinentOtherEvidenceSequence"
  },
  "0040A390": {
    tag: "(0040,A390)",
    vr: "SQ",
    vm: "1",
    name: "HL7StructuredDocumentReferenceSequence"
  },
  "0040A402": {
    tag: "(0040,A402)",
    vr: "UI",
    vm: "1",
    name: "ObservationSubjectUIDTrial"
  },
  "0040A403": {
    tag: "(0040,A403)",
    vr: "CS",
    vm: "1",
    name: "ObservationSubjectClassTrial"
  },
  "0040A404": {
    tag: "(0040,A404)",
    vr: "SQ",
    vm: "1",
    name: "ObservationSubjectTypeCodeSequenceTrial"
  },
  "0040A491": {
    tag: "(0040,A491)",
    vr: "CS",
    vm: "1",
    name: "CompletionFlag"
  },
  "0040A492": {
    tag: "(0040,A492)",
    vr: "LO",
    vm: "1",
    name: "CompletionFlagDescription"
  },
  "0040A493": {
    tag: "(0040,A493)",
    vr: "CS",
    vm: "1",
    name: "VerificationFlag"
  },
  "0040A494": {
    tag: "(0040,A494)",
    vr: "CS",
    vm: "1",
    name: "ArchiveRequested"
  },
  "0040A496": {
    tag: "(0040,A496)",
    vr: "CS",
    vm: "1",
    name: "PreliminaryFlag"
  },
  "0040A504": {
    tag: "(0040,A504)",
    vr: "SQ",
    vm: "1",
    name: "ContentTemplateSequence"
  },
  "0040A525": {
    tag: "(0040,A525)",
    vr: "SQ",
    vm: "1",
    name: "IdenticalDocumentsSequence"
  },
  "0040A600": {
    tag: "(0040,A600)",
    vr: "CS",
    vm: "1",
    name: "ObservationSubjectContextFlagTrial"
  },
  "0040A601": {
    tag: "(0040,A601)",
    vr: "CS",
    vm: "1",
    name: "ObserverContextFlagTrial"
  },
  "0040A603": {
    tag: "(0040,A603)",
    vr: "CS",
    vm: "1",
    name: "ProcedureContextFlagTrial"
  },
  "0040A730": {
    tag: "(0040,A730)",
    vr: "SQ",
    vm: "1",
    name: "ContentSequence"
  },
  "0040A731": {
    tag: "(0040,A731)",
    vr: "SQ",
    vm: "1",
    name: "RelationshipSequenceTrial"
  },
  "0040A732": {
    tag: "(0040,A732)",
    vr: "SQ",
    vm: "1",
    name: "RelationshipTypeCodeSequenceTrial"
  },
  "0040A744": {
    tag: "(0040,A744)",
    vr: "SQ",
    vm: "1",
    name: "LanguageCodeSequenceTrial"
  },
  "0040A992": {
    tag: "(0040,A992)",
    vr: "ST",
    vm: "1",
    name: "UniformResourceLocatorTrial"
  },
  "0040B020": {
    tag: "(0040,B020)",
    vr: "SQ",
    vm: "1",
    name: "WaveformAnnotationSequence"
  },
  "0040DB00": {
    tag: "(0040,DB00)",
    vr: "CS",
    vm: "1",
    name: "TemplateIdentifier"
  },
  "0040DB06": {
    tag: "(0040,DB06)",
    vr: "DT",
    vm: "1",
    name: "TemplateVersion"
  },
  "0040DB07": {
    tag: "(0040,DB07)",
    vr: "DT",
    vm: "1",
    name: "TemplateLocalVersion"
  },
  "0040DB0B": {
    tag: "(0040,DB0B)",
    vr: "CS",
    vm: "1",
    name: "TemplateExtensionFlag"
  },
  "0040DB0C": {
    tag: "(0040,DB0C)",
    vr: "UI",
    vm: "1",
    name: "TemplateExtensionOrganizationUID"
  },
  "0040DB0D": {
    tag: "(0040,DB0D)",
    vr: "UI",
    vm: "1",
    name: "TemplateExtensionCreatorUID"
  },
  "0040DB73": {
    tag: "(0040,DB73)",
    vr: "UL",
    vm: "1-n",
    name: "ReferencedContentItemIdentifier"
  },
  "0040E001": {
    tag: "(0040,E001)",
    vr: "ST",
    vm: "1",
    name: "HL7InstanceIdentifier"
  },
  "0040E004": {
    tag: "(0040,E004)",
    vr: "DT",
    vm: "1",
    name: "HL7DocumentEffectiveTime"
  },
  "0040E006": {
    tag: "(0040,E006)",
    vr: "SQ",
    vm: "1",
    name: "HL7DocumentTypeCodeSequence"
  },
  "0040E008": {
    tag: "(0040,E008)",
    vr: "SQ",
    vm: "1",
    name: "DocumentClassCodeSequence"
  },
  "0040E010": {
    tag: "(0040,E010)",
    vr: "UR",
    vm: "1",
    name: "RetrieveURI"
  },
  "0040E011": {
    tag: "(0040,E011)",
    vr: "UI",
    vm: "1",
    name: "RetrieveLocationUID"
  },
  "0040E020": {
    tag: "(0040,E020)",
    vr: "CS",
    vm: "1",
    name: "TypeOfInstances"
  },
  "0040E021": {
    tag: "(0040,E021)",
    vr: "SQ",
    vm: "1",
    name: "DICOMRetrievalSequence"
  },
  "0040E022": {
    tag: "(0040,E022)",
    vr: "SQ",
    vm: "1",
    name: "DICOMMediaRetrievalSequence"
  },
  "0040E023": {
    tag: "(0040,E023)",
    vr: "SQ",
    vm: "1",
    name: "WADORetrievalSequence"
  },
  "0040E024": {
    tag: "(0040,E024)",
    vr: "SQ",
    vm: "1",
    name: "XDSRetrievalSequence"
  },
  "0040E025": {
    tag: "(0040,E025)",
    vr: "SQ",
    vm: "1",
    name: "WADORSRetrievalSequence"
  },
  "0040E030": {
    tag: "(0040,E030)",
    vr: "UI",
    vm: "1",
    name: "RepositoryUniqueID"
  },
  "0040E031": {
    tag: "(0040,E031)",
    vr: "UI",
    vm: "1",
    name: "HomeCommunityID"
  },
  "00420010": {
    tag: "(0042,0010)",
    vr: "ST",
    vm: "1",
    name: "DocumentTitle"
  },
  "00420011": {
    tag: "(0042,0011)",
    vr: "OB",
    vm: "1",
    name: "EncapsulatedDocument"
  },
  "00420012": {
    tag: "(0042,0012)",
    vr: "LO",
    vm: "1",
    name: "MIMETypeOfEncapsulatedDocument"
  },
  "00420013": {
    tag: "(0042,0013)",
    vr: "SQ",
    vm: "1",
    name: "SourceInstanceSequence"
  },
  "00420014": {
    tag: "(0042,0014)",
    vr: "LO",
    vm: "1-n",
    name: "ListOfMIMETypes"
  },
  "00440001": {
    tag: "(0044,0001)",
    vr: "ST",
    vm: "1",
    name: "ProductPackageIdentifier"
  },
  "00440002": {
    tag: "(0044,0002)",
    vr: "CS",
    vm: "1",
    name: "SubstanceAdministrationApproval"
  },
  "00440003": {
    tag: "(0044,0003)",
    vr: "LT",
    vm: "1",
    name: "ApprovalStatusFurtherDescription"
  },
  "00440004": {
    tag: "(0044,0004)",
    vr: "DT",
    vm: "1",
    name: "ApprovalStatusDateTime"
  },
  "00440007": {
    tag: "(0044,0007)",
    vr: "SQ",
    vm: "1",
    name: "ProductTypeCodeSequence"
  },
  "00440008": {
    tag: "(0044,0008)",
    vr: "LO",
    vm: "1-n",
    name: "ProductName"
  },
  "00440009": {
    tag: "(0044,0009)",
    vr: "LT",
    vm: "1",
    name: "ProductDescription"
  },
  "0044000A": {
    tag: "(0044,000A)",
    vr: "LO",
    vm: "1",
    name: "ProductLotIdentifier"
  },
  "0044000B": {
    tag: "(0044,000B)",
    vr: "DT",
    vm: "1",
    name: "ProductExpirationDateTime"
  },
  "00440010": {
    tag: "(0044,0010)",
    vr: "DT",
    vm: "1",
    name: "SubstanceAdministrationDateTime"
  },
  "00440011": {
    tag: "(0044,0011)",
    vr: "LO",
    vm: "1",
    name: "SubstanceAdministrationNotes"
  },
  "00440012": {
    tag: "(0044,0012)",
    vr: "LO",
    vm: "1",
    name: "SubstanceAdministrationDeviceID"
  },
  "00440013": {
    tag: "(0044,0013)",
    vr: "SQ",
    vm: "1",
    name: "ProductParameterSequence"
  },
  "00440019": {
    tag: "(0044,0019)",
    vr: "SQ",
    vm: "1",
    name: "SubstanceAdministrationParameterSequence"
  },
  "00440100": {
    tag: "(0044,0100)",
    vr: "SQ",
    vm: "1",
    name: "ApprovalSequence"
  },
  "00440101": {
    tag: "(0044,0101)",
    vr: "SQ",
    vm: "1",
    name: "AssertionCodeSequence"
  },
  "00440102": {
    tag: "(0044,0102)",
    vr: "UI",
    vm: "1",
    name: "AssertionUID"
  },
  "00440103": {
    tag: "(0044,0103)",
    vr: "SQ",
    vm: "1",
    name: "AsserterIdentificationSequence"
  },
  "00440104": {
    tag: "(0044,0104)",
    vr: "DT",
    vm: "1",
    name: "AssertionDateTime"
  },
  "00440105": {
    tag: "(0044,0105)",
    vr: "DT",
    vm: "1",
    name: "AssertionExpirationDateTime"
  },
  "00440106": {
    tag: "(0044,0106)",
    vr: "UT",
    vm: "1",
    name: "AssertionComments"
  },
  "00440107": {
    tag: "(0044,0107)",
    vr: "SQ",
    vm: "1",
    name: "RelatedAssertionSequence"
  },
  "00440108": {
    tag: "(0044,0108)",
    vr: "UI",
    vm: "1",
    name: "ReferencedAssertionUID"
  },
  "00440109": {
    tag: "(0044,0109)",
    vr: "SQ",
    vm: "1",
    name: "ApprovalSubjectSequence"
  },
  "0044010A": {
    tag: "(0044,010A)",
    vr: "SQ",
    vm: "1",
    name: "OrganizationalRoleCodeSequence"
  },
  "00460012": {
    tag: "(0046,0012)",
    vr: "LO",
    vm: "1",
    name: "LensDescription"
  },
  "00460014": {
    tag: "(0046,0014)",
    vr: "SQ",
    vm: "1",
    name: "RightLensSequence"
  },
  "00460015": {
    tag: "(0046,0015)",
    vr: "SQ",
    vm: "1",
    name: "LeftLensSequence"
  },
  "00460016": {
    tag: "(0046,0016)",
    vr: "SQ",
    vm: "1",
    name: "UnspecifiedLateralityLensSequence"
  },
  "00460018": {
    tag: "(0046,0018)",
    vr: "SQ",
    vm: "1",
    name: "CylinderSequence"
  },
  "00460028": {
    tag: "(0046,0028)",
    vr: "SQ",
    vm: "1",
    name: "PrismSequence"
  },
  "00460030": {
    tag: "(0046,0030)",
    vr: "FD",
    vm: "1",
    name: "HorizontalPrismPower"
  },
  "00460032": {
    tag: "(0046,0032)",
    vr: "CS",
    vm: "1",
    name: "HorizontalPrismBase"
  },
  "00460034": {
    tag: "(0046,0034)",
    vr: "FD",
    vm: "1",
    name: "VerticalPrismPower"
  },
  "00460036": {
    tag: "(0046,0036)",
    vr: "CS",
    vm: "1",
    name: "VerticalPrismBase"
  },
  "00460038": {
    tag: "(0046,0038)",
    vr: "CS",
    vm: "1",
    name: "LensSegmentType"
  },
  "00460040": {
    tag: "(0046,0040)",
    vr: "FD",
    vm: "1",
    name: "OpticalTransmittance"
  },
  "00460042": {
    tag: "(0046,0042)",
    vr: "FD",
    vm: "1",
    name: "ChannelWidth"
  },
  "00460044": {
    tag: "(0046,0044)",
    vr: "FD",
    vm: "1",
    name: "PupilSize"
  },
  "00460046": {
    tag: "(0046,0046)",
    vr: "FD",
    vm: "1",
    name: "CornealSize"
  },
  "00460050": {
    tag: "(0046,0050)",
    vr: "SQ",
    vm: "1",
    name: "AutorefractionRightEyeSequence"
  },
  "00460052": {
    tag: "(0046,0052)",
    vr: "SQ",
    vm: "1",
    name: "AutorefractionLeftEyeSequence"
  },
  "00460060": {
    tag: "(0046,0060)",
    vr: "FD",
    vm: "1",
    name: "DistancePupillaryDistance"
  },
  "00460062": {
    tag: "(0046,0062)",
    vr: "FD",
    vm: "1",
    name: "NearPupillaryDistance"
  },
  "00460063": {
    tag: "(0046,0063)",
    vr: "FD",
    vm: "1",
    name: "IntermediatePupillaryDistance"
  },
  "00460064": {
    tag: "(0046,0064)",
    vr: "FD",
    vm: "1",
    name: "OtherPupillaryDistance"
  },
  "00460070": {
    tag: "(0046,0070)",
    vr: "SQ",
    vm: "1",
    name: "KeratometryRightEyeSequence"
  },
  "00460071": {
    tag: "(0046,0071)",
    vr: "SQ",
    vm: "1",
    name: "KeratometryLeftEyeSequence"
  },
  "00460074": {
    tag: "(0046,0074)",
    vr: "SQ",
    vm: "1",
    name: "SteepKeratometricAxisSequence"
  },
  "00460075": {
    tag: "(0046,0075)",
    vr: "FD",
    vm: "1",
    name: "RadiusOfCurvature"
  },
  "00460076": {
    tag: "(0046,0076)",
    vr: "FD",
    vm: "1",
    name: "KeratometricPower"
  },
  "00460077": {
    tag: "(0046,0077)",
    vr: "FD",
    vm: "1",
    name: "KeratometricAxis"
  },
  "00460080": {
    tag: "(0046,0080)",
    vr: "SQ",
    vm: "1",
    name: "FlatKeratometricAxisSequence"
  },
  "00460092": {
    tag: "(0046,0092)",
    vr: "CS",
    vm: "1",
    name: "BackgroundColor"
  },
  "00460094": {
    tag: "(0046,0094)",
    vr: "CS",
    vm: "1",
    name: "Optotype"
  },
  "00460095": {
    tag: "(0046,0095)",
    vr: "CS",
    vm: "1",
    name: "OptotypePresentation"
  },
  "00460097": {
    tag: "(0046,0097)",
    vr: "SQ",
    vm: "1",
    name: "SubjectiveRefractionRightEyeSequence"
  },
  "00460098": {
    tag: "(0046,0098)",
    vr: "SQ",
    vm: "1",
    name: "SubjectiveRefractionLeftEyeSequence"
  },
  "00460100": {
    tag: "(0046,0100)",
    vr: "SQ",
    vm: "1",
    name: "AddNearSequence"
  },
  "00460101": {
    tag: "(0046,0101)",
    vr: "SQ",
    vm: "1",
    name: "AddIntermediateSequence"
  },
  "00460102": {
    tag: "(0046,0102)",
    vr: "SQ",
    vm: "1",
    name: "AddOtherSequence"
  },
  "00460104": {
    tag: "(0046,0104)",
    vr: "FD",
    vm: "1",
    name: "AddPower"
  },
  "00460106": {
    tag: "(0046,0106)",
    vr: "FD",
    vm: "1",
    name: "ViewingDistance"
  },
  "00460121": {
    tag: "(0046,0121)",
    vr: "SQ",
    vm: "1",
    name: "VisualAcuityTypeCodeSequence"
  },
  "00460122": {
    tag: "(0046,0122)",
    vr: "SQ",
    vm: "1",
    name: "VisualAcuityRightEyeSequence"
  },
  "00460123": {
    tag: "(0046,0123)",
    vr: "SQ",
    vm: "1",
    name: "VisualAcuityLeftEyeSequence"
  },
  "00460124": {
    tag: "(0046,0124)",
    vr: "SQ",
    vm: "1",
    name: "VisualAcuityBothEyesOpenSequence"
  },
  "00460125": {
    tag: "(0046,0125)",
    vr: "CS",
    vm: "1",
    name: "ViewingDistanceType"
  },
  "00460135": {
    tag: "(0046,0135)",
    vr: "SS",
    vm: "2",
    name: "VisualAcuityModifiers"
  },
  "00460137": {
    tag: "(0046,0137)",
    vr: "FD",
    vm: "1",
    name: "DecimalVisualAcuity"
  },
  "00460139": {
    tag: "(0046,0139)",
    vr: "LO",
    vm: "1",
    name: "OptotypeDetailedDefinition"
  },
  "00460145": {
    tag: "(0046,0145)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedRefractiveMeasurementsSequence"
  },
  "00460146": {
    tag: "(0046,0146)",
    vr: "FD",
    vm: "1",
    name: "SpherePower"
  },
  "00460147": {
    tag: "(0046,0147)",
    vr: "FD",
    vm: "1",
    name: "CylinderPower"
  },
  "00460201": {
    tag: "(0046,0201)",
    vr: "CS",
    vm: "1",
    name: "CornealTopographySurface"
  },
  "00460202": {
    tag: "(0046,0202)",
    vr: "FL",
    vm: "2",
    name: "CornealVertexLocation"
  },
  "00460203": {
    tag: "(0046,0203)",
    vr: "FL",
    vm: "1",
    name: "PupilCentroidXCoordinate"
  },
  "00460204": {
    tag: "(0046,0204)",
    vr: "FL",
    vm: "1",
    name: "PupilCentroidYCoordinate"
  },
  "00460205": {
    tag: "(0046,0205)",
    vr: "FL",
    vm: "1",
    name: "EquivalentPupilRadius"
  },
  "00460207": {
    tag: "(0046,0207)",
    vr: "SQ",
    vm: "1",
    name: "CornealTopographyMapTypeCodeSequence"
  },
  "00460208": {
    tag: "(0046,0208)",
    vr: "IS",
    vm: "2-2n",
    name: "VerticesOfTheOutlineOfPupil"
  },
  "00460210": {
    tag: "(0046,0210)",
    vr: "SQ",
    vm: "1",
    name: "CornealTopographyMappingNormalsSequence"
  },
  "00460211": {
    tag: "(0046,0211)",
    vr: "SQ",
    vm: "1",
    name: "MaximumCornealCurvatureSequence"
  },
  "00460212": {
    tag: "(0046,0212)",
    vr: "FL",
    vm: "1",
    name: "MaximumCornealCurvature"
  },
  "00460213": {
    tag: "(0046,0213)",
    vr: "FL",
    vm: "2",
    name: "MaximumCornealCurvatureLocation"
  },
  "00460215": {
    tag: "(0046,0215)",
    vr: "SQ",
    vm: "1",
    name: "MinimumKeratometricSequence"
  },
  "00460218": {
    tag: "(0046,0218)",
    vr: "SQ",
    vm: "1",
    name: "SimulatedKeratometricCylinderSequence"
  },
  "00460220": {
    tag: "(0046,0220)",
    vr: "FL",
    vm: "1",
    name: "AverageCornealPower"
  },
  "00460224": {
    tag: "(0046,0224)",
    vr: "FL",
    vm: "1",
    name: "CornealISValue"
  },
  "00460227": {
    tag: "(0046,0227)",
    vr: "FL",
    vm: "1",
    name: "AnalyzedArea"
  },
  "00460230": {
    tag: "(0046,0230)",
    vr: "FL",
    vm: "1",
    name: "SurfaceRegularityIndex"
  },
  "00460232": {
    tag: "(0046,0232)",
    vr: "FL",
    vm: "1",
    name: "SurfaceAsymmetryIndex"
  },
  "00460234": {
    tag: "(0046,0234)",
    vr: "FL",
    vm: "1",
    name: "CornealEccentricityIndex"
  },
  "00460236": {
    tag: "(0046,0236)",
    vr: "FL",
    vm: "1",
    name: "KeratoconusPredictionIndex"
  },
  "00460238": {
    tag: "(0046,0238)",
    vr: "FL",
    vm: "1",
    name: "DecimalPotentialVisualAcuity"
  },
  "00460242": {
    tag: "(0046,0242)",
    vr: "CS",
    vm: "1",
    name: "CornealTopographyMapQualityEvaluation"
  },
  "00460244": {
    tag: "(0046,0244)",
    vr: "SQ",
    vm: "1",
    name: "SourceImageCornealProcessedDataSequence"
  },
  "00460247": {
    tag: "(0046,0247)",
    vr: "FL",
    vm: "3",
    name: "CornealPointLocation"
  },
  "00460248": {
    tag: "(0046,0248)",
    vr: "CS",
    vm: "1",
    name: "CornealPointEstimated"
  },
  "00460249": {
    tag: "(0046,0249)",
    vr: "FL",
    vm: "1",
    name: "AxialPower"
  },
  "00460250": {
    tag: "(0046,0250)",
    vr: "FL",
    vm: "1",
    name: "TangentialPower"
  },
  "00460251": {
    tag: "(0046,0251)",
    vr: "FL",
    vm: "1",
    name: "RefractivePower"
  },
  "00460252": {
    tag: "(0046,0252)",
    vr: "FL",
    vm: "1",
    name: "RelativeElevation"
  },
  "00460253": {
    tag: "(0046,0253)",
    vr: "FL",
    vm: "1",
    name: "CornealWavefront"
  },
  "00480001": {
    tag: "(0048,0001)",
    vr: "FL",
    vm: "1",
    name: "ImagedVolumeWidth"
  },
  "00480002": {
    tag: "(0048,0002)",
    vr: "FL",
    vm: "1",
    name: "ImagedVolumeHeight"
  },
  "00480003": {
    tag: "(0048,0003)",
    vr: "FL",
    vm: "1",
    name: "ImagedVolumeDepth"
  },
  "00480006": {
    tag: "(0048,0006)",
    vr: "UL",
    vm: "1",
    name: "TotalPixelMatrixColumns"
  },
  "00480007": {
    tag: "(0048,0007)",
    vr: "UL",
    vm: "1",
    name: "TotalPixelMatrixRows"
  },
  "00480008": {
    tag: "(0048,0008)",
    vr: "SQ",
    vm: "1",
    name: "TotalPixelMatrixOriginSequence"
  },
  "00480010": {
    tag: "(0048,0010)",
    vr: "CS",
    vm: "1",
    name: "SpecimenLabelInImage"
  },
  "00480011": {
    tag: "(0048,0011)",
    vr: "CS",
    vm: "1",
    name: "FocusMethod"
  },
  "00480012": {
    tag: "(0048,0012)",
    vr: "CS",
    vm: "1",
    name: "ExtendedDepthOfField"
  },
  "00480013": {
    tag: "(0048,0013)",
    vr: "US",
    vm: "1",
    name: "NumberOfFocalPlanes"
  },
  "00480014": {
    tag: "(0048,0014)",
    vr: "FL",
    vm: "1",
    name: "DistanceBetweenFocalPlanes"
  },
  "00480015": {
    tag: "(0048,0015)",
    vr: "US",
    vm: "3",
    name: "RecommendedAbsentPixelCIELabValue"
  },
  "00480100": {
    tag: "(0048,0100)",
    vr: "SQ",
    vm: "1",
    name: "IlluminatorTypeCodeSequence"
  },
  "00480102": {
    tag: "(0048,0102)",
    vr: "DS",
    vm: "6",
    name: "ImageOrientationSlide"
  },
  "00480105": {
    tag: "(0048,0105)",
    vr: "SQ",
    vm: "1",
    name: "OpticalPathSequence"
  },
  "00480106": {
    tag: "(0048,0106)",
    vr: "SH",
    vm: "1",
    name: "OpticalPathIdentifier"
  },
  "00480107": {
    tag: "(0048,0107)",
    vr: "ST",
    vm: "1",
    name: "OpticalPathDescription"
  },
  "00480108": {
    tag: "(0048,0108)",
    vr: "SQ",
    vm: "1",
    name: "IlluminationColorCodeSequence"
  },
  "00480110": {
    tag: "(0048,0110)",
    vr: "SQ",
    vm: "1",
    name: "SpecimenReferenceSequence"
  },
  "00480111": {
    tag: "(0048,0111)",
    vr: "DS",
    vm: "1",
    name: "CondenserLensPower"
  },
  "00480112": {
    tag: "(0048,0112)",
    vr: "DS",
    vm: "1",
    name: "ObjectiveLensPower"
  },
  "00480113": {
    tag: "(0048,0113)",
    vr: "DS",
    vm: "1",
    name: "ObjectiveLensNumericalAperture"
  },
  "00480120": {
    tag: "(0048,0120)",
    vr: "SQ",
    vm: "1",
    name: "PaletteColorLookupTableSequence"
  },
  "00480200": {
    tag: "(0048,0200)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedImageNavigationSequence"
  },
  "00480201": {
    tag: "(0048,0201)",
    vr: "US",
    vm: "2",
    name: "TopLeftHandCornerOfLocalizerArea"
  },
  "00480202": {
    tag: "(0048,0202)",
    vr: "US",
    vm: "2",
    name: "BottomRightHandCornerOfLocalizerArea"
  },
  "00480207": {
    tag: "(0048,0207)",
    vr: "SQ",
    vm: "1",
    name: "OpticalPathIdentificationSequence"
  },
  "0048021A": {
    tag: "(0048,021A)",
    vr: "SQ",
    vm: "1",
    name: "PlanePositionSlideSequence"
  },
  "0048021E": {
    tag: "(0048,021E)",
    vr: "SL",
    vm: "1",
    name: "ColumnPositionInTotalImagePixelMatrix"
  },
  "0048021F": {
    tag: "(0048,021F)",
    vr: "SL",
    vm: "1",
    name: "RowPositionInTotalImagePixelMatrix"
  },
  "00480301": {
    tag: "(0048,0301)",
    vr: "CS",
    vm: "1",
    name: "PixelOriginInterpretation"
  },
  "00480302": {
    tag: "(0048,0302)",
    vr: "UL",
    vm: "1",
    name: "NumberOfOpticalPaths"
  },
  "00480303": {
    tag: "(0048,0303)",
    vr: "UL",
    vm: "1",
    name: "TotalPixelMatrixFocalPlanes"
  },
  "00500004": {
    tag: "(0050,0004)",
    vr: "CS",
    vm: "1",
    name: "CalibrationImage"
  },
  "00500010": {
    tag: "(0050,0010)",
    vr: "SQ",
    vm: "1",
    name: "DeviceSequence"
  },
  "00500012": {
    tag: "(0050,0012)",
    vr: "SQ",
    vm: "1",
    name: "ContainerComponentTypeCodeSequence"
  },
  "00500013": {
    tag: "(0050,0013)",
    vr: "FD",
    vm: "1",
    name: "ContainerComponentThickness"
  },
  "00500014": {
    tag: "(0050,0014)",
    vr: "DS",
    vm: "1",
    name: "DeviceLength"
  },
  "00500015": {
    tag: "(0050,0015)",
    vr: "FD",
    vm: "1",
    name: "ContainerComponentWidth"
  },
  "00500016": {
    tag: "(0050,0016)",
    vr: "DS",
    vm: "1",
    name: "DeviceDiameter"
  },
  "00500017": {
    tag: "(0050,0017)",
    vr: "CS",
    vm: "1",
    name: "DeviceDiameterUnits"
  },
  "00500018": {
    tag: "(0050,0018)",
    vr: "DS",
    vm: "1",
    name: "DeviceVolume"
  },
  "00500019": {
    tag: "(0050,0019)",
    vr: "DS",
    vm: "1",
    name: "InterMarkerDistance"
  },
  "0050001A": {
    tag: "(0050,001A)",
    vr: "CS",
    vm: "1",
    name: "ContainerComponentMaterial"
  },
  "0050001B": {
    tag: "(0050,001B)",
    vr: "LO",
    vm: "1",
    name: "ContainerComponentID"
  },
  "0050001C": {
    tag: "(0050,001C)",
    vr: "FD",
    vm: "1",
    name: "ContainerComponentLength"
  },
  "0050001D": {
    tag: "(0050,001D)",
    vr: "FD",
    vm: "1",
    name: "ContainerComponentDiameter"
  },
  "0050001E": {
    tag: "(0050,001E)",
    vr: "LO",
    vm: "1",
    name: "ContainerComponentDescription"
  },
  "00500020": {
    tag: "(0050,0020)",
    vr: "LO",
    vm: "1",
    name: "DeviceDescription"
  },
  "00520001": {
    tag: "(0052,0001)",
    vr: "FL",
    vm: "1",
    name: "ContrastBolusIngredientPercentByVolume"
  },
  "00520002": {
    tag: "(0052,0002)",
    vr: "FD",
    vm: "1",
    name: "OCTFocalDistance"
  },
  "00520003": {
    tag: "(0052,0003)",
    vr: "FD",
    vm: "1",
    name: "BeamSpotSize"
  },
  "00520004": {
    tag: "(0052,0004)",
    vr: "FD",
    vm: "1",
    name: "EffectiveRefractiveIndex"
  },
  "00520006": {
    tag: "(0052,0006)",
    vr: "CS",
    vm: "1",
    name: "OCTAcquisitionDomain"
  },
  "00520007": {
    tag: "(0052,0007)",
    vr: "FD",
    vm: "1",
    name: "OCTOpticalCenterWavelength"
  },
  "00520008": {
    tag: "(0052,0008)",
    vr: "FD",
    vm: "1",
    name: "AxialResolution"
  },
  "00520009": {
    tag: "(0052,0009)",
    vr: "FD",
    vm: "1",
    name: "RangingDepth"
  },
  "00520011": {
    tag: "(0052,0011)",
    vr: "FD",
    vm: "1",
    name: "ALineRate"
  },
  "00520012": {
    tag: "(0052,0012)",
    vr: "US",
    vm: "1",
    name: "ALinesPerFrame"
  },
  "00520013": {
    tag: "(0052,0013)",
    vr: "FD",
    vm: "1",
    name: "CatheterRotationalRate"
  },
  "00520014": {
    tag: "(0052,0014)",
    vr: "FD",
    vm: "1",
    name: "ALinePixelSpacing"
  },
  "00520016": {
    tag: "(0052,0016)",
    vr: "SQ",
    vm: "1",
    name: "ModeOfPercutaneousAccessSequence"
  },
  "00520025": {
    tag: "(0052,0025)",
    vr: "SQ",
    vm: "1",
    name: "IntravascularOCTFrameTypeSequence"
  },
  "00520026": {
    tag: "(0052,0026)",
    vr: "CS",
    vm: "1",
    name: "OCTZOffsetApplied"
  },
  "00520027": {
    tag: "(0052,0027)",
    vr: "SQ",
    vm: "1",
    name: "IntravascularFrameContentSequence"
  },
  "00520028": {
    tag: "(0052,0028)",
    vr: "FD",
    vm: "1",
    name: "IntravascularLongitudinalDistance"
  },
  "00520029": {
    tag: "(0052,0029)",
    vr: "SQ",
    vm: "1",
    name: "IntravascularOCTFrameContentSequence"
  },
  "00520030": {
    tag: "(0052,0030)",
    vr: "SS",
    vm: "1",
    name: "OCTZOffsetCorrection"
  },
  "00520031": {
    tag: "(0052,0031)",
    vr: "CS",
    vm: "1",
    name: "CatheterDirectionOfRotation"
  },
  "00520033": {
    tag: "(0052,0033)",
    vr: "FD",
    vm: "1",
    name: "SeamLineLocation"
  },
  "00520034": {
    tag: "(0052,0034)",
    vr: "FD",
    vm: "1",
    name: "FirstALineLocation"
  },
  "00520036": {
    tag: "(0052,0036)",
    vr: "US",
    vm: "1",
    name: "SeamLineIndex"
  },
  "00520038": {
    tag: "(0052,0038)",
    vr: "US",
    vm: "1",
    name: "NumberOfPaddedALines"
  },
  "00520039": {
    tag: "(0052,0039)",
    vr: "CS",
    vm: "1",
    name: "InterpolationType"
  },
  "0052003A": {
    tag: "(0052,003A)",
    vr: "CS",
    vm: "1",
    name: "RefractiveIndexApplied"
  },
  "00540010": {
    tag: "(0054,0010)",
    vr: "US",
    vm: "1-n",
    name: "EnergyWindowVector"
  },
  "00540011": {
    tag: "(0054,0011)",
    vr: "US",
    vm: "1",
    name: "NumberOfEnergyWindows"
  },
  "00540012": {
    tag: "(0054,0012)",
    vr: "SQ",
    vm: "1",
    name: "EnergyWindowInformationSequence"
  },
  "00540013": {
    tag: "(0054,0013)",
    vr: "SQ",
    vm: "1",
    name: "EnergyWindowRangeSequence"
  },
  "00540014": {
    tag: "(0054,0014)",
    vr: "DS",
    vm: "1",
    name: "EnergyWindowLowerLimit"
  },
  "00540015": {
    tag: "(0054,0015)",
    vr: "DS",
    vm: "1",
    name: "EnergyWindowUpperLimit"
  },
  "00540016": {
    tag: "(0054,0016)",
    vr: "SQ",
    vm: "1",
    name: "RadiopharmaceuticalInformationSequence"
  },
  "00540017": {
    tag: "(0054,0017)",
    vr: "IS",
    vm: "1",
    name: "ResidualSyringeCounts"
  },
  "00540018": {
    tag: "(0054,0018)",
    vr: "SH",
    vm: "1",
    name: "EnergyWindowName"
  },
  "00540020": {
    tag: "(0054,0020)",
    vr: "US",
    vm: "1-n",
    name: "DetectorVector"
  },
  "00540021": {
    tag: "(0054,0021)",
    vr: "US",
    vm: "1",
    name: "NumberOfDetectors"
  },
  "00540022": {
    tag: "(0054,0022)",
    vr: "SQ",
    vm: "1",
    name: "DetectorInformationSequence"
  },
  "00540030": {
    tag: "(0054,0030)",
    vr: "US",
    vm: "1-n",
    name: "PhaseVector"
  },
  "00540031": {
    tag: "(0054,0031)",
    vr: "US",
    vm: "1",
    name: "NumberOfPhases"
  },
  "00540032": {
    tag: "(0054,0032)",
    vr: "SQ",
    vm: "1",
    name: "PhaseInformationSequence"
  },
  "00540033": {
    tag: "(0054,0033)",
    vr: "US",
    vm: "1",
    name: "NumberOfFramesInPhase"
  },
  "00540036": {
    tag: "(0054,0036)",
    vr: "IS",
    vm: "1",
    name: "PhaseDelay"
  },
  "00540038": {
    tag: "(0054,0038)",
    vr: "IS",
    vm: "1",
    name: "PauseBetweenFrames"
  },
  "00540039": {
    tag: "(0054,0039)",
    vr: "CS",
    vm: "1",
    name: "PhaseDescription"
  },
  "00540050": {
    tag: "(0054,0050)",
    vr: "US",
    vm: "1-n",
    name: "RotationVector"
  },
  "00540051": {
    tag: "(0054,0051)",
    vr: "US",
    vm: "1",
    name: "NumberOfRotations"
  },
  "00540052": {
    tag: "(0054,0052)",
    vr: "SQ",
    vm: "1",
    name: "RotationInformationSequence"
  },
  "00540053": {
    tag: "(0054,0053)",
    vr: "US",
    vm: "1",
    name: "NumberOfFramesInRotation"
  },
  "00540060": {
    tag: "(0054,0060)",
    vr: "US",
    vm: "1-n",
    name: "RRIntervalVector"
  },
  "00540061": {
    tag: "(0054,0061)",
    vr: "US",
    vm: "1",
    name: "NumberOfRRIntervals"
  },
  "00540062": {
    tag: "(0054,0062)",
    vr: "SQ",
    vm: "1",
    name: "GatedInformationSequence"
  },
  "00540063": {
    tag: "(0054,0063)",
    vr: "SQ",
    vm: "1",
    name: "DataInformationSequence"
  },
  "00540070": {
    tag: "(0054,0070)",
    vr: "US",
    vm: "1-n",
    name: "TimeSlotVector"
  },
  "00540071": {
    tag: "(0054,0071)",
    vr: "US",
    vm: "1",
    name: "NumberOfTimeSlots"
  },
  "00540072": {
    tag: "(0054,0072)",
    vr: "SQ",
    vm: "1",
    name: "TimeSlotInformationSequence"
  },
  "00540073": {
    tag: "(0054,0073)",
    vr: "DS",
    vm: "1",
    name: "TimeSlotTime"
  },
  "00540080": {
    tag: "(0054,0080)",
    vr: "US",
    vm: "1-n",
    name: "SliceVector"
  },
  "00540081": {
    tag: "(0054,0081)",
    vr: "US",
    vm: "1",
    name: "NumberOfSlices"
  },
  "00540090": {
    tag: "(0054,0090)",
    vr: "US",
    vm: "1-n",
    name: "AngularViewVector"
  },
  "00540100": {
    tag: "(0054,0100)",
    vr: "US",
    vm: "1-n",
    name: "TimeSliceVector"
  },
  "00540101": {
    tag: "(0054,0101)",
    vr: "US",
    vm: "1",
    name: "NumberOfTimeSlices"
  },
  "00540200": {
    tag: "(0054,0200)",
    vr: "DS",
    vm: "1",
    name: "StartAngle"
  },
  "00540202": {
    tag: "(0054,0202)",
    vr: "CS",
    vm: "1",
    name: "TypeOfDetectorMotion"
  },
  "00540210": {
    tag: "(0054,0210)",
    vr: "IS",
    vm: "1-n",
    name: "TriggerVector"
  },
  "00540211": {
    tag: "(0054,0211)",
    vr: "US",
    vm: "1",
    name: "NumberOfTriggersInPhase"
  },
  "00540220": {
    tag: "(0054,0220)",
    vr: "SQ",
    vm: "1",
    name: "ViewCodeSequence"
  },
  "00540222": {
    tag: "(0054,0222)",
    vr: "SQ",
    vm: "1",
    name: "ViewModifierCodeSequence"
  },
  "00540300": {
    tag: "(0054,0300)",
    vr: "SQ",
    vm: "1",
    name: "RadionuclideCodeSequence"
  },
  "00540302": {
    tag: "(0054,0302)",
    vr: "SQ",
    vm: "1",
    name: "AdministrationRouteCodeSequence"
  },
  "00540304": {
    tag: "(0054,0304)",
    vr: "SQ",
    vm: "1",
    name: "RadiopharmaceuticalCodeSequence"
  },
  "00540306": {
    tag: "(0054,0306)",
    vr: "SQ",
    vm: "1",
    name: "CalibrationDataSequence"
  },
  "00540308": {
    tag: "(0054,0308)",
    vr: "US",
    vm: "1",
    name: "EnergyWindowNumber"
  },
  "00540400": {
    tag: "(0054,0400)",
    vr: "SH",
    vm: "1",
    name: "ImageID"
  },
  "00540410": {
    tag: "(0054,0410)",
    vr: "SQ",
    vm: "1",
    name: "PatientOrientationCodeSequence"
  },
  "00540412": {
    tag: "(0054,0412)",
    vr: "SQ",
    vm: "1",
    name: "PatientOrientationModifierCodeSequence"
  },
  "00540414": {
    tag: "(0054,0414)",
    vr: "SQ",
    vm: "1",
    name: "PatientGantryRelationshipCodeSequence"
  },
  "00540500": {
    tag: "(0054,0500)",
    vr: "CS",
    vm: "1",
    name: "SliceProgressionDirection"
  },
  "00540501": {
    tag: "(0054,0501)",
    vr: "CS",
    vm: "1",
    name: "ScanProgressionDirection"
  },
  "00541000": {
    tag: "(0054,1000)",
    vr: "CS",
    vm: "2",
    name: "SeriesType"
  },
  "00541001": {
    tag: "(0054,1001)",
    vr: "CS",
    vm: "1",
    name: "Units"
  },
  "00541002": {
    tag: "(0054,1002)",
    vr: "CS",
    vm: "1",
    name: "CountsSource"
  },
  "00541004": {
    tag: "(0054,1004)",
    vr: "CS",
    vm: "1",
    name: "ReprojectionMethod"
  },
  "00541006": {
    tag: "(0054,1006)",
    vr: "CS",
    vm: "1",
    name: "SUVType"
  },
  "00541100": {
    tag: "(0054,1100)",
    vr: "CS",
    vm: "1",
    name: "RandomsCorrectionMethod"
  },
  "00541101": {
    tag: "(0054,1101)",
    vr: "LO",
    vm: "1",
    name: "AttenuationCorrectionMethod"
  },
  "00541102": {
    tag: "(0054,1102)",
    vr: "CS",
    vm: "1",
    name: "DecayCorrection"
  },
  "00541103": {
    tag: "(0054,1103)",
    vr: "LO",
    vm: "1",
    name: "ReconstructionMethod"
  },
  "00541104": {
    tag: "(0054,1104)",
    vr: "LO",
    vm: "1",
    name: "DetectorLinesOfResponseUsed"
  },
  "00541105": {
    tag: "(0054,1105)",
    vr: "LO",
    vm: "1",
    name: "ScatterCorrectionMethod"
  },
  "00541200": {
    tag: "(0054,1200)",
    vr: "DS",
    vm: "1",
    name: "AxialAcceptance"
  },
  "00541201": {
    tag: "(0054,1201)",
    vr: "IS",
    vm: "2",
    name: "AxialMash"
  },
  "00541202": {
    tag: "(0054,1202)",
    vr: "IS",
    vm: "1",
    name: "TransverseMash"
  },
  "00541203": {
    tag: "(0054,1203)",
    vr: "DS",
    vm: "2",
    name: "DetectorElementSize"
  },
  "00541210": {
    tag: "(0054,1210)",
    vr: "DS",
    vm: "1",
    name: "CoincidenceWindowWidth"
  },
  "00541220": {
    tag: "(0054,1220)",
    vr: "CS",
    vm: "1-n",
    name: "SecondaryCountsType"
  },
  "00541300": {
    tag: "(0054,1300)",
    vr: "DS",
    vm: "1",
    name: "FrameReferenceTime"
  },
  "00541310": {
    tag: "(0054,1310)",
    vr: "IS",
    vm: "1",
    name: "PrimaryPromptsCountsAccumulated"
  },
  "00541311": {
    tag: "(0054,1311)",
    vr: "IS",
    vm: "1-n",
    name: "SecondaryCountsAccumulated"
  },
  "00541320": {
    tag: "(0054,1320)",
    vr: "DS",
    vm: "1",
    name: "SliceSensitivityFactor"
  },
  "00541321": {
    tag: "(0054,1321)",
    vr: "DS",
    vm: "1",
    name: "DecayFactor"
  },
  "00541322": {
    tag: "(0054,1322)",
    vr: "DS",
    vm: "1",
    name: "DoseCalibrationFactor"
  },
  "00541323": {
    tag: "(0054,1323)",
    vr: "DS",
    vm: "1",
    name: "ScatterFractionFactor"
  },
  "00541324": {
    tag: "(0054,1324)",
    vr: "DS",
    vm: "1",
    name: "DeadTimeFactor"
  },
  "00541330": {
    tag: "(0054,1330)",
    vr: "US",
    vm: "1",
    name: "ImageIndex"
  },
  "00541400": {
    tag: "(0054,1400)",
    vr: "CS",
    vm: "1-n",
    name: "CountsIncluded"
  },
  "00541401": {
    tag: "(0054,1401)",
    vr: "CS",
    vm: "1",
    name: "DeadTimeCorrectionFlag"
  },
  "00603000": {
    tag: "(0060,3000)",
    vr: "SQ",
    vm: "1",
    name: "HistogramSequence"
  },
  "00603002": {
    tag: "(0060,3002)",
    vr: "US",
    vm: "1",
    name: "HistogramNumberOfBins"
  },
  "00603004": {
    tag: "(0060,3004)",
    vr: "US|SS",
    vm: "1",
    name: "HistogramFirstBinValue"
  },
  "00603006": {
    tag: "(0060,3006)",
    vr: "US|SS",
    vm: "1",
    name: "HistogramLastBinValue"
  },
  "00603008": {
    tag: "(0060,3008)",
    vr: "US",
    vm: "1",
    name: "HistogramBinWidth"
  },
  "00603010": {
    tag: "(0060,3010)",
    vr: "LO",
    vm: "1",
    name: "HistogramExplanation"
  },
  "00603020": {
    tag: "(0060,3020)",
    vr: "UL",
    vm: "1-n",
    name: "HistogramData"
  },
  "00620001": {
    tag: "(0062,0001)",
    vr: "CS",
    vm: "1",
    name: "SegmentationType"
  },
  "00620002": {
    tag: "(0062,0002)",
    vr: "SQ",
    vm: "1",
    name: "SegmentSequence"
  },
  "00620003": {
    tag: "(0062,0003)",
    vr: "SQ",
    vm: "1",
    name: "SegmentedPropertyCategoryCodeSequence"
  },
  "00620004": {
    tag: "(0062,0004)",
    vr: "US",
    vm: "1",
    name: "SegmentNumber"
  },
  "00620005": {
    tag: "(0062,0005)",
    vr: "LO",
    vm: "1",
    name: "SegmentLabel"
  },
  "00620006": {
    tag: "(0062,0006)",
    vr: "ST",
    vm: "1",
    name: "SegmentDescription"
  },
  "00620007": {
    tag: "(0062,0007)",
    vr: "SQ",
    vm: "1",
    name: "SegmentationAlgorithmIdentificationSequence"
  },
  "00620008": {
    tag: "(0062,0008)",
    vr: "CS",
    vm: "1",
    name: "SegmentAlgorithmType"
  },
  "00620009": {
    tag: "(0062,0009)",
    vr: "LO",
    vm: "1",
    name: "SegmentAlgorithmName"
  },
  "0062000A": {
    tag: "(0062,000A)",
    vr: "SQ",
    vm: "1",
    name: "SegmentIdentificationSequence"
  },
  "0062000B": {
    tag: "(0062,000B)",
    vr: "US",
    vm: "1-n",
    name: "ReferencedSegmentNumber"
  },
  "0062000C": {
    tag: "(0062,000C)",
    vr: "US",
    vm: "1",
    name: "RecommendedDisplayGrayscaleValue"
  },
  "0062000D": {
    tag: "(0062,000D)",
    vr: "US",
    vm: "3",
    name: "RecommendedDisplayCIELabValue"
  },
  "0062000E": {
    tag: "(0062,000E)",
    vr: "US",
    vm: "1",
    name: "MaximumFractionalValue"
  },
  "0062000F": {
    tag: "(0062,000F)",
    vr: "SQ",
    vm: "1",
    name: "SegmentedPropertyTypeCodeSequence"
  },
  "00620010": {
    tag: "(0062,0010)",
    vr: "CS",
    vm: "1",
    name: "SegmentationFractionalType"
  },
  "00620011": {
    tag: "(0062,0011)",
    vr: "SQ",
    vm: "1",
    name: "SegmentedPropertyTypeModifierCodeSequence"
  },
  "00620012": {
    tag: "(0062,0012)",
    vr: "SQ",
    vm: "1",
    name: "UsedSegmentsSequence"
  },
  "00620020": {
    tag: "(0062,0020)",
    vr: "UT",
    vm: "1",
    name: "TrackingID"
  },
  "00620021": {
    tag: "(0062,0021)",
    vr: "UI",
    vm: "1",
    name: "TrackingUID"
  },
  "00640002": {
    tag: "(0064,0002)",
    vr: "SQ",
    vm: "1",
    name: "DeformableRegistrationSequence"
  },
  "00640003": {
    tag: "(0064,0003)",
    vr: "UI",
    vm: "1",
    name: "SourceFrameOfReferenceUID"
  },
  "00640005": {
    tag: "(0064,0005)",
    vr: "SQ",
    vm: "1",
    name: "DeformableRegistrationGridSequence"
  },
  "00640007": {
    tag: "(0064,0007)",
    vr: "UL",
    vm: "3",
    name: "GridDimensions"
  },
  "00640008": {
    tag: "(0064,0008)",
    vr: "FD",
    vm: "3",
    name: "GridResolution"
  },
  "00640009": {
    tag: "(0064,0009)",
    vr: "OF",
    vm: "1",
    name: "VectorGridData"
  },
  "0064000F": {
    tag: "(0064,000F)",
    vr: "SQ",
    vm: "1",
    name: "PreDeformationMatrixRegistrationSequence"
  },
  "00640010": {
    tag: "(0064,0010)",
    vr: "SQ",
    vm: "1",
    name: "PostDeformationMatrixRegistrationSequence"
  },
  "00660001": {
    tag: "(0066,0001)",
    vr: "UL",
    vm: "1",
    name: "NumberOfSurfaces"
  },
  "00660002": {
    tag: "(0066,0002)",
    vr: "SQ",
    vm: "1",
    name: "SurfaceSequence"
  },
  "00660003": {
    tag: "(0066,0003)",
    vr: "UL",
    vm: "1",
    name: "SurfaceNumber"
  },
  "00660004": {
    tag: "(0066,0004)",
    vr: "LT",
    vm: "1",
    name: "SurfaceComments"
  },
  "00660009": {
    tag: "(0066,0009)",
    vr: "CS",
    vm: "1",
    name: "SurfaceProcessing"
  },
  "0066000A": {
    tag: "(0066,000A)",
    vr: "FL",
    vm: "1",
    name: "SurfaceProcessingRatio"
  },
  "0066000B": {
    tag: "(0066,000B)",
    vr: "LO",
    vm: "1",
    name: "SurfaceProcessingDescription"
  },
  "0066000C": {
    tag: "(0066,000C)",
    vr: "FL",
    vm: "1",
    name: "RecommendedPresentationOpacity"
  },
  "0066000D": {
    tag: "(0066,000D)",
    vr: "CS",
    vm: "1",
    name: "RecommendedPresentationType"
  },
  "0066000E": {
    tag: "(0066,000E)",
    vr: "CS",
    vm: "1",
    name: "FiniteVolume"
  },
  "00660010": {
    tag: "(0066,0010)",
    vr: "CS",
    vm: "1",
    name: "Manifold"
  },
  "00660011": {
    tag: "(0066,0011)",
    vr: "SQ",
    vm: "1",
    name: "SurfacePointsSequence"
  },
  "00660012": {
    tag: "(0066,0012)",
    vr: "SQ",
    vm: "1",
    name: "SurfacePointsNormalsSequence"
  },
  "00660013": {
    tag: "(0066,0013)",
    vr: "SQ",
    vm: "1",
    name: "SurfaceMeshPrimitivesSequence"
  },
  "00660015": {
    tag: "(0066,0015)",
    vr: "UL",
    vm: "1",
    name: "NumberOfSurfacePoints"
  },
  "00660016": {
    tag: "(0066,0016)",
    vr: "OF",
    vm: "1",
    name: "PointCoordinatesData"
  },
  "00660017": {
    tag: "(0066,0017)",
    vr: "FL",
    vm: "3",
    name: "PointPositionAccuracy"
  },
  "00660018": {
    tag: "(0066,0018)",
    vr: "FL",
    vm: "1",
    name: "MeanPointDistance"
  },
  "00660019": {
    tag: "(0066,0019)",
    vr: "FL",
    vm: "1",
    name: "MaximumPointDistance"
  },
  "0066001A": {
    tag: "(0066,001A)",
    vr: "FL",
    vm: "6",
    name: "PointsBoundingBoxCoordinates"
  },
  "0066001B": {
    tag: "(0066,001B)",
    vr: "FL",
    vm: "3",
    name: "AxisOfRotation"
  },
  "0066001C": {
    tag: "(0066,001C)",
    vr: "FL",
    vm: "3",
    name: "CenterOfRotation"
  },
  "0066001E": {
    tag: "(0066,001E)",
    vr: "UL",
    vm: "1",
    name: "NumberOfVectors"
  },
  "0066001F": {
    tag: "(0066,001F)",
    vr: "US",
    vm: "1",
    name: "VectorDimensionality"
  },
  "00660020": {
    tag: "(0066,0020)",
    vr: "FL",
    vm: "1-n",
    name: "VectorAccuracy"
  },
  "00660021": {
    tag: "(0066,0021)",
    vr: "OF",
    vm: "1",
    name: "VectorCoordinateData"
  },
  "00660023": {
    tag: "(0066,0023)",
    vr: "OW",
    vm: "1",
    name: "TrianglePointIndexList"
  },
  "00660024": {
    tag: "(0066,0024)",
    vr: "OW",
    vm: "1",
    name: "EdgePointIndexList"
  },
  "00660025": {
    tag: "(0066,0025)",
    vr: "OW",
    vm: "1",
    name: "VertexPointIndexList"
  },
  "00660026": {
    tag: "(0066,0026)",
    vr: "SQ",
    vm: "1",
    name: "TriangleStripSequence"
  },
  "00660027": {
    tag: "(0066,0027)",
    vr: "SQ",
    vm: "1",
    name: "TriangleFanSequence"
  },
  "00660028": {
    tag: "(0066,0028)",
    vr: "SQ",
    vm: "1",
    name: "LineSequence"
  },
  "00660029": {
    tag: "(0066,0029)",
    vr: "OW",
    vm: "1",
    name: "PrimitivePointIndexList"
  },
  "0066002A": {
    tag: "(0066,002A)",
    vr: "UL",
    vm: "1",
    name: "SurfaceCount"
  },
  "0066002B": {
    tag: "(0066,002B)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedSurfaceSequence"
  },
  "0066002C": {
    tag: "(0066,002C)",
    vr: "UL",
    vm: "1",
    name: "ReferencedSurfaceNumber"
  },
  "0066002D": {
    tag: "(0066,002D)",
    vr: "SQ",
    vm: "1",
    name: "SegmentSurfaceGenerationAlgorithmIdentificationSequence"
  },
  "0066002E": {
    tag: "(0066,002E)",
    vr: "SQ",
    vm: "1",
    name: "SegmentSurfaceSourceInstanceSequence"
  },
  "0066002F": {
    tag: "(0066,002F)",
    vr: "SQ",
    vm: "1",
    name: "AlgorithmFamilyCodeSequence"
  },
  "00660030": {
    tag: "(0066,0030)",
    vr: "SQ",
    vm: "1",
    name: "AlgorithmNameCodeSequence"
  },
  "00660031": {
    tag: "(0066,0031)",
    vr: "LO",
    vm: "1",
    name: "AlgorithmVersion"
  },
  "00660032": {
    tag: "(0066,0032)",
    vr: "LT",
    vm: "1",
    name: "AlgorithmParameters"
  },
  "00660034": {
    tag: "(0066,0034)",
    vr: "SQ",
    vm: "1",
    name: "FacetSequence"
  },
  "00660035": {
    tag: "(0066,0035)",
    vr: "SQ",
    vm: "1",
    name: "SurfaceProcessingAlgorithmIdentificationSequence"
  },
  "00660036": {
    tag: "(0066,0036)",
    vr: "LO",
    vm: "1",
    name: "AlgorithmName"
  },
  "00660037": {
    tag: "(0066,0037)",
    vr: "FL",
    vm: "1",
    name: "RecommendedPointRadius"
  },
  "00660038": {
    tag: "(0066,0038)",
    vr: "FL",
    vm: "1",
    name: "RecommendedLineThickness"
  },
  "00660040": {
    tag: "(0066,0040)",
    vr: "OL",
    vm: "1",
    name: "LongPrimitivePointIndexList"
  },
  "00660041": {
    tag: "(0066,0041)",
    vr: "OL",
    vm: "1",
    name: "LongTrianglePointIndexList"
  },
  "00660042": {
    tag: "(0066,0042)",
    vr: "OL",
    vm: "1",
    name: "LongEdgePointIndexList"
  },
  "00660043": {
    tag: "(0066,0043)",
    vr: "OL",
    vm: "1",
    name: "LongVertexPointIndexList"
  },
  "00660101": {
    tag: "(0066,0101)",
    vr: "SQ",
    vm: "1",
    name: "TrackSetSequence"
  },
  "00660102": {
    tag: "(0066,0102)",
    vr: "SQ",
    vm: "1",
    name: "TrackSequence"
  },
  "00660103": {
    tag: "(0066,0103)",
    vr: "OW",
    vm: "1",
    name: "RecommendedDisplayCIELabValueList"
  },
  "00660104": {
    tag: "(0066,0104)",
    vr: "SQ",
    vm: "1",
    name: "TrackingAlgorithmIdentificationSequence"
  },
  "00660105": {
    tag: "(0066,0105)",
    vr: "UL",
    vm: "1",
    name: "TrackSetNumber"
  },
  "00660106": {
    tag: "(0066,0106)",
    vr: "LO",
    vm: "1",
    name: "TrackSetLabel"
  },
  "00660107": {
    tag: "(0066,0107)",
    vr: "UT",
    vm: "1",
    name: "TrackSetDescription"
  },
  "00660108": {
    tag: "(0066,0108)",
    vr: "SQ",
    vm: "1",
    name: "TrackSetAnatomicalTypeCodeSequence"
  },
  "00660121": {
    tag: "(0066,0121)",
    vr: "SQ",
    vm: "1",
    name: "MeasurementsSequence"
  },
  "00660124": {
    tag: "(0066,0124)",
    vr: "SQ",
    vm: "1",
    name: "TrackSetStatisticsSequence"
  },
  "00660125": {
    tag: "(0066,0125)",
    vr: "OF",
    vm: "1",
    name: "FloatingPointValues"
  },
  "00660129": {
    tag: "(0066,0129)",
    vr: "OL",
    vm: "1",
    name: "TrackPointIndexList"
  },
  "00660130": {
    tag: "(0066,0130)",
    vr: "SQ",
    vm: "1",
    name: "TrackStatisticsSequence"
  },
  "00660132": {
    tag: "(0066,0132)",
    vr: "SQ",
    vm: "1",
    name: "MeasurementValuesSequence"
  },
  "00660133": {
    tag: "(0066,0133)",
    vr: "SQ",
    vm: "1",
    name: "DiffusionAcquisitionCodeSequence"
  },
  "00660134": {
    tag: "(0066,0134)",
    vr: "SQ",
    vm: "1",
    name: "DiffusionModelCodeSequence"
  },
  "00686210": {
    tag: "(0068,6210)",
    vr: "LO",
    vm: "1",
    name: "ImplantSize"
  },
  "00686221": {
    tag: "(0068,6221)",
    vr: "LO",
    vm: "1",
    name: "ImplantTemplateVersion"
  },
  "00686222": {
    tag: "(0068,6222)",
    vr: "SQ",
    vm: "1",
    name: "ReplacedImplantTemplateSequence"
  },
  "00686223": {
    tag: "(0068,6223)",
    vr: "CS",
    vm: "1",
    name: "ImplantType"
  },
  "00686224": {
    tag: "(0068,6224)",
    vr: "SQ",
    vm: "1",
    name: "DerivationImplantTemplateSequence"
  },
  "00686225": {
    tag: "(0068,6225)",
    vr: "SQ",
    vm: "1",
    name: "OriginalImplantTemplateSequence"
  },
  "00686226": {
    tag: "(0068,6226)",
    vr: "DT",
    vm: "1",
    name: "EffectiveDateTime"
  },
  "00686230": {
    tag: "(0068,6230)",
    vr: "SQ",
    vm: "1",
    name: "ImplantTargetAnatomySequence"
  },
  "00686260": {
    tag: "(0068,6260)",
    vr: "SQ",
    vm: "1",
    name: "InformationFromManufacturerSequence"
  },
  "00686265": {
    tag: "(0068,6265)",
    vr: "SQ",
    vm: "1",
    name: "NotificationFromManufacturerSequence"
  },
  "00686270": {
    tag: "(0068,6270)",
    vr: "DT",
    vm: "1",
    name: "InformationIssueDateTime"
  },
  "00686280": {
    tag: "(0068,6280)",
    vr: "ST",
    vm: "1",
    name: "InformationSummary"
  },
  "006862A0": {
    tag: "(0068,62A0)",
    vr: "SQ",
    vm: "1",
    name: "ImplantRegulatoryDisapprovalCodeSequence"
  },
  "006862A5": {
    tag: "(0068,62A5)",
    vr: "FD",
    vm: "1",
    name: "OverallTemplateSpatialTolerance"
  },
  "006862C0": {
    tag: "(0068,62C0)",
    vr: "SQ",
    vm: "1",
    name: "HPGLDocumentSequence"
  },
  "006862D0": {
    tag: "(0068,62D0)",
    vr: "US",
    vm: "1",
    name: "HPGLDocumentID"
  },
  "006862D5": {
    tag: "(0068,62D5)",
    vr: "LO",
    vm: "1",
    name: "HPGLDocumentLabel"
  },
  "006862E0": {
    tag: "(0068,62E0)",
    vr: "SQ",
    vm: "1",
    name: "ViewOrientationCodeSequence"
  },
  "006862F0": {
    tag: "(0068,62F0)",
    vr: "SQ",
    vm: "1",
    name: "ViewOrientationModifierCodeSequence"
  },
  "006862F2": {
    tag: "(0068,62F2)",
    vr: "FD",
    vm: "1",
    name: "HPGLDocumentScaling"
  },
  "00686300": {
    tag: "(0068,6300)",
    vr: "OB",
    vm: "1",
    name: "HPGLDocument"
  },
  "00686310": {
    tag: "(0068,6310)",
    vr: "US",
    vm: "1",
    name: "HPGLContourPenNumber"
  },
  "00686320": {
    tag: "(0068,6320)",
    vr: "SQ",
    vm: "1",
    name: "HPGLPenSequence"
  },
  "00686330": {
    tag: "(0068,6330)",
    vr: "US",
    vm: "1",
    name: "HPGLPenNumber"
  },
  "00686340": {
    tag: "(0068,6340)",
    vr: "LO",
    vm: "1",
    name: "HPGLPenLabel"
  },
  "00686345": {
    tag: "(0068,6345)",
    vr: "ST",
    vm: "1",
    name: "HPGLPenDescription"
  },
  "00686346": {
    tag: "(0068,6346)",
    vr: "FD",
    vm: "2",
    name: "RecommendedRotationPoint"
  },
  "00686347": {
    tag: "(0068,6347)",
    vr: "FD",
    vm: "4",
    name: "BoundingRectangle"
  },
  "00686350": {
    tag: "(0068,6350)",
    vr: "US",
    vm: "1-n",
    name: "ImplantTemplate3DModelSurfaceNumber"
  },
  "00686360": {
    tag: "(0068,6360)",
    vr: "SQ",
    vm: "1",
    name: "SurfaceModelDescriptionSequence"
  },
  "00686380": {
    tag: "(0068,6380)",
    vr: "LO",
    vm: "1",
    name: "SurfaceModelLabel"
  },
  "00686390": {
    tag: "(0068,6390)",
    vr: "FD",
    vm: "1",
    name: "SurfaceModelScalingFactor"
  },
  "006863A0": {
    tag: "(0068,63A0)",
    vr: "SQ",
    vm: "1",
    name: "MaterialsCodeSequence"
  },
  "006863A4": {
    tag: "(0068,63A4)",
    vr: "SQ",
    vm: "1",
    name: "CoatingMaterialsCodeSequence"
  },
  "006863A8": {
    tag: "(0068,63A8)",
    vr: "SQ",
    vm: "1",
    name: "ImplantTypeCodeSequence"
  },
  "006863AC": {
    tag: "(0068,63AC)",
    vr: "SQ",
    vm: "1",
    name: "FixationMethodCodeSequence"
  },
  "006863B0": {
    tag: "(0068,63B0)",
    vr: "SQ",
    vm: "1",
    name: "MatingFeatureSetsSequence"
  },
  "006863C0": {
    tag: "(0068,63C0)",
    vr: "US",
    vm: "1",
    name: "MatingFeatureSetID"
  },
  "006863D0": {
    tag: "(0068,63D0)",
    vr: "LO",
    vm: "1",
    name: "MatingFeatureSetLabel"
  },
  "006863E0": {
    tag: "(0068,63E0)",
    vr: "SQ",
    vm: "1",
    name: "MatingFeatureSequence"
  },
  "006863F0": {
    tag: "(0068,63F0)",
    vr: "US",
    vm: "1",
    name: "MatingFeatureID"
  },
  "00686400": {
    tag: "(0068,6400)",
    vr: "SQ",
    vm: "1",
    name: "MatingFeatureDegreeOfFreedomSequence"
  },
  "00686410": {
    tag: "(0068,6410)",
    vr: "US",
    vm: "1",
    name: "DegreeOfFreedomID"
  },
  "00686420": {
    tag: "(0068,6420)",
    vr: "CS",
    vm: "1",
    name: "DegreeOfFreedomType"
  },
  "00686430": {
    tag: "(0068,6430)",
    vr: "SQ",
    vm: "1",
    name: "TwoDMatingFeatureCoordinatesSequence"
  },
  "00686440": {
    tag: "(0068,6440)",
    vr: "US",
    vm: "1",
    name: "ReferencedHPGLDocumentID"
  },
  "00686450": {
    tag: "(0068,6450)",
    vr: "FD",
    vm: "2",
    name: "TwoDMatingPoint"
  },
  "00686460": {
    tag: "(0068,6460)",
    vr: "FD",
    vm: "4",
    name: "TwoDMatingAxes"
  },
  "00686470": {
    tag: "(0068,6470)",
    vr: "SQ",
    vm: "1",
    name: "TwoDDegreeOfFreedomSequence"
  },
  "00686490": {
    tag: "(0068,6490)",
    vr: "FD",
    vm: "3",
    name: "ThreeDDegreeOfFreedomAxis"
  },
  "006864A0": {
    tag: "(0068,64A0)",
    vr: "FD",
    vm: "2",
    name: "RangeOfFreedom"
  },
  "006864C0": {
    tag: "(0068,64C0)",
    vr: "FD",
    vm: "3",
    name: "ThreeDMatingPoint"
  },
  "006864D0": {
    tag: "(0068,64D0)",
    vr: "FD",
    vm: "9",
    name: "ThreeDMatingAxes"
  },
  "006864F0": {
    tag: "(0068,64F0)",
    vr: "FD",
    vm: "3",
    name: "TwoDDegreeOfFreedomAxis"
  },
  "00686500": {
    tag: "(0068,6500)",
    vr: "SQ",
    vm: "1",
    name: "PlanningLandmarkPointSequence"
  },
  "00686510": {
    tag: "(0068,6510)",
    vr: "SQ",
    vm: "1",
    name: "PlanningLandmarkLineSequence"
  },
  "00686520": {
    tag: "(0068,6520)",
    vr: "SQ",
    vm: "1",
    name: "PlanningLandmarkPlaneSequence"
  },
  "00686530": {
    tag: "(0068,6530)",
    vr: "US",
    vm: "1",
    name: "PlanningLandmarkID"
  },
  "00686540": {
    tag: "(0068,6540)",
    vr: "LO",
    vm: "1",
    name: "PlanningLandmarkDescription"
  },
  "00686545": {
    tag: "(0068,6545)",
    vr: "SQ",
    vm: "1",
    name: "PlanningLandmarkIdentificationCodeSequence"
  },
  "00686550": {
    tag: "(0068,6550)",
    vr: "SQ",
    vm: "1",
    name: "TwoDPointCoordinatesSequence"
  },
  "00686560": {
    tag: "(0068,6560)",
    vr: "FD",
    vm: "2",
    name: "TwoDPointCoordinates"
  },
  "00686590": {
    tag: "(0068,6590)",
    vr: "FD",
    vm: "3",
    name: "ThreeDPointCoordinates"
  },
  "006865A0": {
    tag: "(0068,65A0)",
    vr: "SQ",
    vm: "1",
    name: "TwoDLineCoordinatesSequence"
  },
  "006865B0": {
    tag: "(0068,65B0)",
    vr: "FD",
    vm: "4",
    name: "TwoDLineCoordinates"
  },
  "006865D0": {
    tag: "(0068,65D0)",
    vr: "FD",
    vm: "6",
    name: "ThreeDLineCoordinates"
  },
  "006865E0": {
    tag: "(0068,65E0)",
    vr: "SQ",
    vm: "1",
    name: "TwoDPlaneCoordinatesSequence"
  },
  "006865F0": {
    tag: "(0068,65F0)",
    vr: "FD",
    vm: "4",
    name: "TwoDPlaneIntersection"
  },
  "00686610": {
    tag: "(0068,6610)",
    vr: "FD",
    vm: "3",
    name: "ThreeDPlaneOrigin"
  },
  "00686620": {
    tag: "(0068,6620)",
    vr: "FD",
    vm: "3",
    name: "ThreeDPlaneNormal"
  },
  "00687001": {
    tag: "(0068,7001)",
    vr: "CS",
    vm: "1",
    name: "ModelModification"
  },
  "00687002": {
    tag: "(0068,7002)",
    vr: "CS",
    vm: "1",
    name: "ModelMirroring"
  },
  "00687003": {
    tag: "(0068,7003)",
    vr: "SQ",
    vm: "1",
    name: "ModelUsageCodeSequence"
  },
  "00700001": {
    tag: "(0070,0001)",
    vr: "SQ",
    vm: "1",
    name: "GraphicAnnotationSequence"
  },
  "00700002": {
    tag: "(0070,0002)",
    vr: "CS",
    vm: "1",
    name: "GraphicLayer"
  },
  "00700003": {
    tag: "(0070,0003)",
    vr: "CS",
    vm: "1",
    name: "BoundingBoxAnnotationUnits"
  },
  "00700004": {
    tag: "(0070,0004)",
    vr: "CS",
    vm: "1",
    name: "AnchorPointAnnotationUnits"
  },
  "00700005": {
    tag: "(0070,0005)",
    vr: "CS",
    vm: "1",
    name: "GraphicAnnotationUnits"
  },
  "00700006": {
    tag: "(0070,0006)",
    vr: "ST",
    vm: "1",
    name: "UnformattedTextValue"
  },
  "00700008": {
    tag: "(0070,0008)",
    vr: "SQ",
    vm: "1",
    name: "TextObjectSequence"
  },
  "00700009": {
    tag: "(0070,0009)",
    vr: "SQ",
    vm: "1",
    name: "GraphicObjectSequence"
  },
  "00700010": {
    tag: "(0070,0010)",
    vr: "FL",
    vm: "2",
    name: "BoundingBoxTopLeftHandCorner"
  },
  "00700011": {
    tag: "(0070,0011)",
    vr: "FL",
    vm: "2",
    name: "BoundingBoxBottomRightHandCorner"
  },
  "00700012": {
    tag: "(0070,0012)",
    vr: "CS",
    vm: "1",
    name: "BoundingBoxTextHorizontalJustification"
  },
  "00700014": {
    tag: "(0070,0014)",
    vr: "FL",
    vm: "2",
    name: "AnchorPoint"
  },
  "00700015": {
    tag: "(0070,0015)",
    vr: "CS",
    vm: "1",
    name: "AnchorPointVisibility"
  },
  "00700020": {
    tag: "(0070,0020)",
    vr: "US",
    vm: "1",
    name: "GraphicDimensions"
  },
  "00700021": {
    tag: "(0070,0021)",
    vr: "US",
    vm: "1",
    name: "NumberOfGraphicPoints"
  },
  "00700022": {
    tag: "(0070,0022)",
    vr: "FL",
    vm: "2-n",
    name: "GraphicData"
  },
  "00700023": {
    tag: "(0070,0023)",
    vr: "CS",
    vm: "1",
    name: "GraphicType"
  },
  "00700024": {
    tag: "(0070,0024)",
    vr: "CS",
    vm: "1",
    name: "GraphicFilled"
  },
  "00700040": {
    tag: "(0070,0040)",
    vr: "IS",
    vm: "1",
    name: "ImageRotationRetired"
  },
  "00700041": {
    tag: "(0070,0041)",
    vr: "CS",
    vm: "1",
    name: "ImageHorizontalFlip"
  },
  "00700042": {
    tag: "(0070,0042)",
    vr: "US",
    vm: "1",
    name: "ImageRotation"
  },
  "00700050": {
    tag: "(0070,0050)",
    vr: "US",
    vm: "2",
    name: "DisplayedAreaTopLeftHandCornerTrial"
  },
  "00700051": {
    tag: "(0070,0051)",
    vr: "US",
    vm: "2",
    name: "DisplayedAreaBottomRightHandCornerTrial"
  },
  "00700052": {
    tag: "(0070,0052)",
    vr: "SL",
    vm: "2",
    name: "DisplayedAreaTopLeftHandCorner"
  },
  "00700053": {
    tag: "(0070,0053)",
    vr: "SL",
    vm: "2",
    name: "DisplayedAreaBottomRightHandCorner"
  },
  "0070005A": {
    tag: "(0070,005A)",
    vr: "SQ",
    vm: "1",
    name: "DisplayedAreaSelectionSequence"
  },
  "00700060": {
    tag: "(0070,0060)",
    vr: "SQ",
    vm: "1",
    name: "GraphicLayerSequence"
  },
  "00700062": {
    tag: "(0070,0062)",
    vr: "IS",
    vm: "1",
    name: "GraphicLayerOrder"
  },
  "00700066": {
    tag: "(0070,0066)",
    vr: "US",
    vm: "1",
    name: "GraphicLayerRecommendedDisplayGrayscaleValue"
  },
  "00700067": {
    tag: "(0070,0067)",
    vr: "US",
    vm: "3",
    name: "GraphicLayerRecommendedDisplayRGBValue"
  },
  "00700068": {
    tag: "(0070,0068)",
    vr: "LO",
    vm: "1",
    name: "GraphicLayerDescription"
  },
  "00700080": {
    tag: "(0070,0080)",
    vr: "CS",
    vm: "1",
    name: "ContentLabel"
  },
  "00700081": {
    tag: "(0070,0081)",
    vr: "LO",
    vm: "1",
    name: "ContentDescription"
  },
  "00700082": {
    tag: "(0070,0082)",
    vr: "DA",
    vm: "1",
    name: "PresentationCreationDate"
  },
  "00700083": {
    tag: "(0070,0083)",
    vr: "TM",
    vm: "1",
    name: "PresentationCreationTime"
  },
  "00700084": {
    tag: "(0070,0084)",
    vr: "PN",
    vm: "1",
    name: "ContentCreatorName"
  },
  "00700086": {
    tag: "(0070,0086)",
    vr: "SQ",
    vm: "1",
    name: "ContentCreatorIdentificationCodeSequence"
  },
  "00700087": {
    tag: "(0070,0087)",
    vr: "SQ",
    vm: "1",
    name: "AlternateContentDescriptionSequence"
  },
  "00700100": {
    tag: "(0070,0100)",
    vr: "CS",
    vm: "1",
    name: "PresentationSizeMode"
  },
  "00700101": {
    tag: "(0070,0101)",
    vr: "DS",
    vm: "2",
    name: "PresentationPixelSpacing"
  },
  "00700102": {
    tag: "(0070,0102)",
    vr: "IS",
    vm: "2",
    name: "PresentationPixelAspectRatio"
  },
  "00700103": {
    tag: "(0070,0103)",
    vr: "FL",
    vm: "1",
    name: "PresentationPixelMagnificationRatio"
  },
  "00700207": {
    tag: "(0070,0207)",
    vr: "LO",
    vm: "1",
    name: "GraphicGroupLabel"
  },
  "00700208": {
    tag: "(0070,0208)",
    vr: "ST",
    vm: "1",
    name: "GraphicGroupDescription"
  },
  "00700209": {
    tag: "(0070,0209)",
    vr: "SQ",
    vm: "1",
    name: "CompoundGraphicSequence"
  },
  "00700226": {
    tag: "(0070,0226)",
    vr: "UL",
    vm: "1",
    name: "CompoundGraphicInstanceID"
  },
  "00700227": {
    tag: "(0070,0227)",
    vr: "LO",
    vm: "1",
    name: "FontName"
  },
  "00700228": {
    tag: "(0070,0228)",
    vr: "CS",
    vm: "1",
    name: "FontNameType"
  },
  "00700229": {
    tag: "(0070,0229)",
    vr: "LO",
    vm: "1",
    name: "CSSFontName"
  },
  "00700230": {
    tag: "(0070,0230)",
    vr: "FD",
    vm: "1",
    name: "RotationAngle"
  },
  "00700231": {
    tag: "(0070,0231)",
    vr: "SQ",
    vm: "1",
    name: "TextStyleSequence"
  },
  "00700232": {
    tag: "(0070,0232)",
    vr: "SQ",
    vm: "1",
    name: "LineStyleSequence"
  },
  "00700233": {
    tag: "(0070,0233)",
    vr: "SQ",
    vm: "1",
    name: "FillStyleSequence"
  },
  "00700234": {
    tag: "(0070,0234)",
    vr: "SQ",
    vm: "1",
    name: "GraphicGroupSequence"
  },
  "00700241": {
    tag: "(0070,0241)",
    vr: "US",
    vm: "3",
    name: "TextColorCIELabValue"
  },
  "00700242": {
    tag: "(0070,0242)",
    vr: "CS",
    vm: "1",
    name: "HorizontalAlignment"
  },
  "00700243": {
    tag: "(0070,0243)",
    vr: "CS",
    vm: "1",
    name: "VerticalAlignment"
  },
  "00700244": {
    tag: "(0070,0244)",
    vr: "CS",
    vm: "1",
    name: "ShadowStyle"
  },
  "00700245": {
    tag: "(0070,0245)",
    vr: "FL",
    vm: "1",
    name: "ShadowOffsetX"
  },
  "00700246": {
    tag: "(0070,0246)",
    vr: "FL",
    vm: "1",
    name: "ShadowOffsetY"
  },
  "00700247": {
    tag: "(0070,0247)",
    vr: "US",
    vm: "3",
    name: "ShadowColorCIELabValue"
  },
  "00700248": {
    tag: "(0070,0248)",
    vr: "CS",
    vm: "1",
    name: "Underlined"
  },
  "00700249": {
    tag: "(0070,0249)",
    vr: "CS",
    vm: "1",
    name: "Bold"
  },
  "00700250": {
    tag: "(0070,0250)",
    vr: "CS",
    vm: "1",
    name: "Italic"
  },
  "00700251": {
    tag: "(0070,0251)",
    vr: "US",
    vm: "3",
    name: "PatternOnColorCIELabValue"
  },
  "00700252": {
    tag: "(0070,0252)",
    vr: "US",
    vm: "3",
    name: "PatternOffColorCIELabValue"
  },
  "00700253": {
    tag: "(0070,0253)",
    vr: "FL",
    vm: "1",
    name: "LineThickness"
  },
  "00700254": {
    tag: "(0070,0254)",
    vr: "CS",
    vm: "1",
    name: "LineDashingStyle"
  },
  "00700255": {
    tag: "(0070,0255)",
    vr: "UL",
    vm: "1",
    name: "LinePattern"
  },
  "00700256": {
    tag: "(0070,0256)",
    vr: "OB",
    vm: "1",
    name: "FillPattern"
  },
  "00700257": {
    tag: "(0070,0257)",
    vr: "CS",
    vm: "1",
    name: "FillMode"
  },
  "00700258": {
    tag: "(0070,0258)",
    vr: "FL",
    vm: "1",
    name: "ShadowOpacity"
  },
  "00700261": {
    tag: "(0070,0261)",
    vr: "FL",
    vm: "1",
    name: "GapLength"
  },
  "00700262": {
    tag: "(0070,0262)",
    vr: "FL",
    vm: "1",
    name: "DiameterOfVisibility"
  },
  "00700273": {
    tag: "(0070,0273)",
    vr: "FL",
    vm: "2",
    name: "RotationPoint"
  },
  "00700274": {
    tag: "(0070,0274)",
    vr: "CS",
    vm: "1",
    name: "TickAlignment"
  },
  "00700278": {
    tag: "(0070,0278)",
    vr: "CS",
    vm: "1",
    name: "ShowTickLabel"
  },
  "00700279": {
    tag: "(0070,0279)",
    vr: "CS",
    vm: "1",
    name: "TickLabelAlignment"
  },
  "00700282": {
    tag: "(0070,0282)",
    vr: "CS",
    vm: "1",
    name: "CompoundGraphicUnits"
  },
  "00700284": {
    tag: "(0070,0284)",
    vr: "FL",
    vm: "1",
    name: "PatternOnOpacity"
  },
  "00700285": {
    tag: "(0070,0285)",
    vr: "FL",
    vm: "1",
    name: "PatternOffOpacity"
  },
  "00700287": {
    tag: "(0070,0287)",
    vr: "SQ",
    vm: "1",
    name: "MajorTicksSequence"
  },
  "00700288": {
    tag: "(0070,0288)",
    vr: "FL",
    vm: "1",
    name: "TickPosition"
  },
  "00700289": {
    tag: "(0070,0289)",
    vr: "SH",
    vm: "1",
    name: "TickLabel"
  },
  "00700294": {
    tag: "(0070,0294)",
    vr: "CS",
    vm: "1",
    name: "CompoundGraphicType"
  },
  "00700295": {
    tag: "(0070,0295)",
    vr: "UL",
    vm: "1",
    name: "GraphicGroupID"
  },
  "00700306": {
    tag: "(0070,0306)",
    vr: "CS",
    vm: "1",
    name: "ShapeType"
  },
  "00700308": {
    tag: "(0070,0308)",
    vr: "SQ",
    vm: "1",
    name: "RegistrationSequence"
  },
  "00700309": {
    tag: "(0070,0309)",
    vr: "SQ",
    vm: "1",
    name: "MatrixRegistrationSequence"
  },
  "0070030A": {
    tag: "(0070,030A)",
    vr: "SQ",
    vm: "1",
    name: "MatrixSequence"
  },
  "0070030B": {
    tag: "(0070,030B)",
    vr: "FD",
    vm: "16",
    name: "FrameOfReferenceToDisplayedCoordinateSystemTransformationMatrix"
  },
  "0070030C": {
    tag: "(0070,030C)",
    vr: "CS",
    vm: "1",
    name: "FrameOfReferenceTransformationMatrixType"
  },
  "0070030D": {
    tag: "(0070,030D)",
    vr: "SQ",
    vm: "1",
    name: "RegistrationTypeCodeSequence"
  },
  "0070030F": {
    tag: "(0070,030F)",
    vr: "ST",
    vm: "1",
    name: "FiducialDescription"
  },
  "00700310": {
    tag: "(0070,0310)",
    vr: "SH",
    vm: "1",
    name: "FiducialIdentifier"
  },
  "00700311": {
    tag: "(0070,0311)",
    vr: "SQ",
    vm: "1",
    name: "FiducialIdentifierCodeSequence"
  },
  "00700312": {
    tag: "(0070,0312)",
    vr: "FD",
    vm: "1",
    name: "ContourUncertaintyRadius"
  },
  "00700314": {
    tag: "(0070,0314)",
    vr: "SQ",
    vm: "1",
    name: "UsedFiducialsSequence"
  },
  "00700318": {
    tag: "(0070,0318)",
    vr: "SQ",
    vm: "1",
    name: "GraphicCoordinatesDataSequence"
  },
  "0070031A": {
    tag: "(0070,031A)",
    vr: "UI",
    vm: "1",
    name: "FiducialUID"
  },
  "0070031B": {
    tag: "(0070,031B)",
    vr: "UI",
    vm: "1",
    name: "ReferencedFiducialUID"
  },
  "0070031C": {
    tag: "(0070,031C)",
    vr: "SQ",
    vm: "1",
    name: "FiducialSetSequence"
  },
  "0070031E": {
    tag: "(0070,031E)",
    vr: "SQ",
    vm: "1",
    name: "FiducialSequence"
  },
  "0070031F": {
    tag: "(0070,031F)",
    vr: "SQ",
    vm: "1",
    name: "FiducialsPropertyCategoryCodeSequence"
  },
  "00700401": {
    tag: "(0070,0401)",
    vr: "US",
    vm: "3",
    name: "GraphicLayerRecommendedDisplayCIELabValue"
  },
  "00700402": {
    tag: "(0070,0402)",
    vr: "SQ",
    vm: "1",
    name: "BlendingSequence"
  },
  "00700403": {
    tag: "(0070,0403)",
    vr: "FL",
    vm: "1",
    name: "RelativeOpacity"
  },
  "00700404": {
    tag: "(0070,0404)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedSpatialRegistrationSequence"
  },
  "00700405": {
    tag: "(0070,0405)",
    vr: "CS",
    vm: "1",
    name: "BlendingPosition"
  },
  "00701101": {
    tag: "(0070,1101)",
    vr: "UI",
    vm: "1",
    name: "PresentationDisplayCollectionUID"
  },
  "00701102": {
    tag: "(0070,1102)",
    vr: "UI",
    vm: "1",
    name: "PresentationSequenceCollectionUID"
  },
  "00701103": {
    tag: "(0070,1103)",
    vr: "US",
    vm: "1",
    name: "PresentationSequencePositionIndex"
  },
  "00701104": {
    tag: "(0070,1104)",
    vr: "SQ",
    vm: "1",
    name: "RenderedImageReferenceSequence"
  },
  "00701201": {
    tag: "(0070,1201)",
    vr: "SQ",
    vm: "1",
    name: "VolumetricPresentationStateInputSequence"
  },
  "00701202": {
    tag: "(0070,1202)",
    vr: "CS",
    vm: "1",
    name: "PresentationInputType"
  },
  "00701203": {
    tag: "(0070,1203)",
    vr: "US",
    vm: "1",
    name: "InputSequencePositionIndex"
  },
  "00701204": {
    tag: "(0070,1204)",
    vr: "CS",
    vm: "1",
    name: "Crop"
  },
  "00701205": {
    tag: "(0070,1205)",
    vr: "US",
    vm: "1-n",
    name: "CroppingSpecificationIndex"
  },
  "00701206": {
    tag: "(0070,1206)",
    vr: "CS",
    vm: "1",
    name: "CompositingMethod"
  },
  "00701207": {
    tag: "(0070,1207)",
    vr: "US",
    vm: "1",
    name: "VolumetricPresentationInputNumber"
  },
  "00701208": {
    tag: "(0070,1208)",
    vr: "CS",
    vm: "1",
    name: "ImageVolumeGeometry"
  },
  "00701209": {
    tag: "(0070,1209)",
    vr: "UI",
    vm: "1",
    name: "VolumetricPresentationInputSetUID"
  },
  "0070120A": {
    tag: "(0070,120A)",
    vr: "SQ",
    vm: "1",
    name: "VolumetricPresentationInputSetSequence"
  },
  "0070120B": {
    tag: "(0070,120B)",
    vr: "CS",
    vm: "1",
    name: "GlobalCrop"
  },
  "0070120C": {
    tag: "(0070,120C)",
    vr: "US",
    vm: "1-n",
    name: "GlobalCroppingSpecificationIndex"
  },
  "0070120D": {
    tag: "(0070,120D)",
    vr: "CS",
    vm: "1",
    name: "RenderingMethod"
  },
  "00701301": {
    tag: "(0070,1301)",
    vr: "SQ",
    vm: "1",
    name: "VolumeCroppingSequence"
  },
  "00701302": {
    tag: "(0070,1302)",
    vr: "CS",
    vm: "1",
    name: "VolumeCroppingMethod"
  },
  "00701303": {
    tag: "(0070,1303)",
    vr: "FD",
    vm: "6",
    name: "BoundingBoxCrop"
  },
  "00701304": {
    tag: "(0070,1304)",
    vr: "SQ",
    vm: "1",
    name: "ObliqueCroppingPlaneSequence"
  },
  "00701305": {
    tag: "(0070,1305)",
    vr: "FD",
    vm: "4",
    name: "Plane"
  },
  "00701306": {
    tag: "(0070,1306)",
    vr: "FD",
    vm: "3",
    name: "PlaneNormal"
  },
  "00701309": {
    tag: "(0070,1309)",
    vr: "US",
    vm: "1",
    name: "CroppingSpecificationNumber"
  },
  "00701501": {
    tag: "(0070,1501)",
    vr: "CS",
    vm: "1",
    name: "MultiPlanarReconstructionStyle"
  },
  "00701502": {
    tag: "(0070,1502)",
    vr: "CS",
    vm: "1",
    name: "MPRThicknessType"
  },
  "00701503": {
    tag: "(0070,1503)",
    vr: "FD",
    vm: "1",
    name: "MPRSlabThickness"
  },
  "00701505": {
    tag: "(0070,1505)",
    vr: "FD",
    vm: "3",
    name: "MPRTopLeftHandCorner"
  },
  "00701507": {
    tag: "(0070,1507)",
    vr: "FD",
    vm: "3",
    name: "MPRViewWidthDirection"
  },
  "00701508": {
    tag: "(0070,1508)",
    vr: "FD",
    vm: "1",
    name: "MPRViewWidth"
  },
  "0070150C": {
    tag: "(0070,150C)",
    vr: "UL",
    vm: "1",
    name: "NumberOfVolumetricCurvePoints"
  },
  "0070150D": {
    tag: "(0070,150D)",
    vr: "OD",
    vm: "1",
    name: "VolumetricCurvePoints"
  },
  "00701511": {
    tag: "(0070,1511)",
    vr: "FD",
    vm: "3",
    name: "MPRViewHeightDirection"
  },
  "00701512": {
    tag: "(0070,1512)",
    vr: "FD",
    vm: "1",
    name: "MPRViewHeight"
  },
  "00701602": {
    tag: "(0070,1602)",
    vr: "CS",
    vm: "1",
    name: "RenderProjection"
  },
  "00701603": {
    tag: "(0070,1603)",
    vr: "FD",
    vm: "3",
    name: "ViewpointPosition"
  },
  "00701604": {
    tag: "(0070,1604)",
    vr: "FD",
    vm: "3",
    name: "ViewpointLookAtPoint"
  },
  "00701605": {
    tag: "(0070,1605)",
    vr: "FD",
    vm: "3",
    name: "ViewpointUpDirection"
  },
  "00701606": {
    tag: "(0070,1606)",
    vr: "FD",
    vm: "6",
    name: "RenderFieldOfView"
  },
  "00701607": {
    tag: "(0070,1607)",
    vr: "FD",
    vm: "1",
    name: "SamplingStepSize"
  },
  "00701701": {
    tag: "(0070,1701)",
    vr: "CS",
    vm: "1",
    name: "ShadingStyle"
  },
  "00701702": {
    tag: "(0070,1702)",
    vr: "FD",
    vm: "1",
    name: "AmbientReflectionIntensity"
  },
  "00701703": {
    tag: "(0070,1703)",
    vr: "FD",
    vm: "3",
    name: "LightDirection"
  },
  "00701704": {
    tag: "(0070,1704)",
    vr: "FD",
    vm: "1",
    name: "DiffuseReflectionIntensity"
  },
  "00701705": {
    tag: "(0070,1705)",
    vr: "FD",
    vm: "1",
    name: "SpecularReflectionIntensity"
  },
  "00701706": {
    tag: "(0070,1706)",
    vr: "FD",
    vm: "1",
    name: "Shininess"
  },
  "00701801": {
    tag: "(0070,1801)",
    vr: "SQ",
    vm: "1",
    name: "PresentationStateClassificationComponentSequence"
  },
  "00701802": {
    tag: "(0070,1802)",
    vr: "CS",
    vm: "1",
    name: "ComponentType"
  },
  "00701803": {
    tag: "(0070,1803)",
    vr: "SQ",
    vm: "1",
    name: "ComponentInputSequence"
  },
  "00701804": {
    tag: "(0070,1804)",
    vr: "US",
    vm: "1",
    name: "VolumetricPresentationInputIndex"
  },
  "00701805": {
    tag: "(0070,1805)",
    vr: "SQ",
    vm: "1",
    name: "PresentationStateCompositorComponentSequence"
  },
  "00701806": {
    tag: "(0070,1806)",
    vr: "SQ",
    vm: "1",
    name: "WeightingTransferFunctionSequence"
  },
  "00701807": {
    tag: "(0070,1807)",
    vr: "US",
    vm: "3",
    name: "WeightingLookupTableDescriptor"
  },
  "00701808": {
    tag: "(0070,1808)",
    vr: "OB",
    vm: "1",
    name: "WeightingLookupTableData"
  },
  "00701901": {
    tag: "(0070,1901)",
    vr: "SQ",
    vm: "1",
    name: "VolumetricAnnotationSequence"
  },
  "00701903": {
    tag: "(0070,1903)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedStructuredContextSequence"
  },
  "00701904": {
    tag: "(0070,1904)",
    vr: "UI",
    vm: "1",
    name: "ReferencedContentItem"
  },
  "00701905": {
    tag: "(0070,1905)",
    vr: "SQ",
    vm: "1",
    name: "VolumetricPresentationInputAnnotationSequence"
  },
  "00701907": {
    tag: "(0070,1907)",
    vr: "CS",
    vm: "1",
    name: "AnnotationClipping"
  },
  "00701A01": {
    tag: "(0070,1A01)",
    vr: "CS",
    vm: "1",
    name: "PresentationAnimationStyle"
  },
  "00701A03": {
    tag: "(0070,1A03)",
    vr: "FD",
    vm: "1",
    name: "RecommendedAnimationRate"
  },
  "00701A04": {
    tag: "(0070,1A04)",
    vr: "SQ",
    vm: "1",
    name: "AnimationCurveSequence"
  },
  "00701A05": {
    tag: "(0070,1A05)",
    vr: "FD",
    vm: "1",
    name: "AnimationStepSize"
  },
  "00701A06": {
    tag: "(0070,1A06)",
    vr: "FD",
    vm: "1",
    name: "SwivelRange"
  },
  "00701A07": {
    tag: "(0070,1A07)",
    vr: "OD",
    vm: "1",
    name: "VolumetricCurveUpDirections"
  },
  "00701A08": {
    tag: "(0070,1A08)",
    vr: "SQ",
    vm: "1",
    name: "VolumeStreamSequence"
  },
  "00701A09": {
    tag: "(0070,1A09)",
    vr: "LO",
    vm: "1",
    name: "RGBATransferFunctionDescription"
  },
  "00701B01": {
    tag: "(0070,1B01)",
    vr: "SQ",
    vm: "1",
    name: "AdvancedBlendingSequence"
  },
  "00701B02": {
    tag: "(0070,1B02)",
    vr: "US",
    vm: "1",
    name: "BlendingInputNumber"
  },
  "00701B03": {
    tag: "(0070,1B03)",
    vr: "SQ",
    vm: "1",
    name: "BlendingDisplayInputSequence"
  },
  "00701B04": {
    tag: "(0070,1B04)",
    vr: "SQ",
    vm: "1",
    name: "BlendingDisplaySequence"
  },
  "00701B06": {
    tag: "(0070,1B06)",
    vr: "CS",
    vm: "1",
    name: "BlendingMode"
  },
  "00701B07": {
    tag: "(0070,1B07)",
    vr: "CS",
    vm: "1",
    name: "TimeSeriesBlending"
  },
  "00701B08": {
    tag: "(0070,1B08)",
    vr: "CS",
    vm: "1",
    name: "GeometryForDisplay"
  },
  "00701B11": {
    tag: "(0070,1B11)",
    vr: "SQ",
    vm: "1",
    name: "ThresholdSequence"
  },
  "00701B12": {
    tag: "(0070,1B12)",
    vr: "SQ",
    vm: "1",
    name: "ThresholdValueSequence"
  },
  "00701B13": {
    tag: "(0070,1B13)",
    vr: "CS",
    vm: "1",
    name: "ThresholdType"
  },
  "00701B14": {
    tag: "(0070,1B14)",
    vr: "FD",
    vm: "1",
    name: "ThresholdValue"
  },
  "00720002": {
    tag: "(0072,0002)",
    vr: "SH",
    vm: "1",
    name: "HangingProtocolName"
  },
  "00720004": {
    tag: "(0072,0004)",
    vr: "LO",
    vm: "1",
    name: "HangingProtocolDescription"
  },
  "00720006": {
    tag: "(0072,0006)",
    vr: "CS",
    vm: "1",
    name: "HangingProtocolLevel"
  },
  "00720008": {
    tag: "(0072,0008)",
    vr: "LO",
    vm: "1",
    name: "HangingProtocolCreator"
  },
  "0072000A": {
    tag: "(0072,000A)",
    vr: "DT",
    vm: "1",
    name: "HangingProtocolCreationDateTime"
  },
  "0072000C": {
    tag: "(0072,000C)",
    vr: "SQ",
    vm: "1",
    name: "HangingProtocolDefinitionSequence"
  },
  "0072000E": {
    tag: "(0072,000E)",
    vr: "SQ",
    vm: "1",
    name: "HangingProtocolUserIdentificationCodeSequence"
  },
  "00720010": {
    tag: "(0072,0010)",
    vr: "LO",
    vm: "1",
    name: "HangingProtocolUserGroupName"
  },
  "00720012": {
    tag: "(0072,0012)",
    vr: "SQ",
    vm: "1",
    name: "SourceHangingProtocolSequence"
  },
  "00720014": {
    tag: "(0072,0014)",
    vr: "US",
    vm: "1",
    name: "NumberOfPriorsReferenced"
  },
  "00720020": {
    tag: "(0072,0020)",
    vr: "SQ",
    vm: "1",
    name: "ImageSetsSequence"
  },
  "00720022": {
    tag: "(0072,0022)",
    vr: "SQ",
    vm: "1",
    name: "ImageSetSelectorSequence"
  },
  "00720024": {
    tag: "(0072,0024)",
    vr: "CS",
    vm: "1",
    name: "ImageSetSelectorUsageFlag"
  },
  "00720026": {
    tag: "(0072,0026)",
    vr: "AT",
    vm: "1",
    name: "SelectorAttribute"
  },
  "00720028": {
    tag: "(0072,0028)",
    vr: "US",
    vm: "1",
    name: "SelectorValueNumber"
  },
  "00720030": {
    tag: "(0072,0030)",
    vr: "SQ",
    vm: "1",
    name: "TimeBasedImageSetsSequence"
  },
  "00720032": {
    tag: "(0072,0032)",
    vr: "US",
    vm: "1",
    name: "ImageSetNumber"
  },
  "00720034": {
    tag: "(0072,0034)",
    vr: "CS",
    vm: "1",
    name: "ImageSetSelectorCategory"
  },
  "00720038": {
    tag: "(0072,0038)",
    vr: "US",
    vm: "2",
    name: "RelativeTime"
  },
  "0072003A": {
    tag: "(0072,003A)",
    vr: "CS",
    vm: "1",
    name: "RelativeTimeUnits"
  },
  "0072003C": {
    tag: "(0072,003C)",
    vr: "SS",
    vm: "2",
    name: "AbstractPriorValue"
  },
  "0072003E": {
    tag: "(0072,003E)",
    vr: "SQ",
    vm: "1",
    name: "AbstractPriorCodeSequence"
  },
  "00720040": {
    tag: "(0072,0040)",
    vr: "LO",
    vm: "1",
    name: "ImageSetLabel"
  },
  "00720050": {
    tag: "(0072,0050)",
    vr: "CS",
    vm: "1",
    name: "SelectorAttributeVR"
  },
  "00720052": {
    tag: "(0072,0052)",
    vr: "AT",
    vm: "1-n",
    name: "SelectorSequencePointer"
  },
  "00720054": {
    tag: "(0072,0054)",
    vr: "LO",
    vm: "1-n",
    name: "SelectorSequencePointerPrivateCreator"
  },
  "00720056": {
    tag: "(0072,0056)",
    vr: "LO",
    vm: "1",
    name: "SelectorAttributePrivateCreator"
  },
  "0072005E": {
    tag: "(0072,005E)",
    vr: "AE",
    vm: "1-n",
    name: "SelectorAEValue"
  },
  "0072005F": {
    tag: "(0072,005F)",
    vr: "AS",
    vm: "1-n",
    name: "SelectorASValue"
  },
  "00720060": {
    tag: "(0072,0060)",
    vr: "AT",
    vm: "1-n",
    name: "SelectorATValue"
  },
  "00720061": {
    tag: "(0072,0061)",
    vr: "DA",
    vm: "1-n",
    name: "SelectorDAValue"
  },
  "00720062": {
    tag: "(0072,0062)",
    vr: "CS",
    vm: "1-n",
    name: "SelectorCSValue"
  },
  "00720063": {
    tag: "(0072,0063)",
    vr: "DT",
    vm: "1-n",
    name: "SelectorDTValue"
  },
  "00720064": {
    tag: "(0072,0064)",
    vr: "IS",
    vm: "1-n",
    name: "SelectorISValue"
  },
  "00720065": {
    tag: "(0072,0065)",
    vr: "OB",
    vm: "1",
    name: "SelectorOBValue"
  },
  "00720066": {
    tag: "(0072,0066)",
    vr: "LO",
    vm: "1-n",
    name: "SelectorLOValue"
  },
  "00720067": {
    tag: "(0072,0067)",
    vr: "OF",
    vm: "1",
    name: "SelectorOFValue"
  },
  "00720068": {
    tag: "(0072,0068)",
    vr: "LT",
    vm: "1",
    name: "SelectorLTValue"
  },
  "00720069": {
    tag: "(0072,0069)",
    vr: "OW",
    vm: "1",
    name: "SelectorOWValue"
  },
  "0072006A": {
    tag: "(0072,006A)",
    vr: "PN",
    vm: "1-n",
    name: "SelectorPNValue"
  },
  "0072006B": {
    tag: "(0072,006B)",
    vr: "TM",
    vm: "1-n",
    name: "SelectorTMValue"
  },
  "0072006C": {
    tag: "(0072,006C)",
    vr: "SH",
    vm: "1-n",
    name: "SelectorSHValue"
  },
  "0072006D": {
    tag: "(0072,006D)",
    vr: "UN",
    vm: "1",
    name: "SelectorUNValue"
  },
  "0072006E": {
    tag: "(0072,006E)",
    vr: "ST",
    vm: "1",
    name: "SelectorSTValue"
  },
  "0072006F": {
    tag: "(0072,006F)",
    vr: "UC",
    vm: "1-n",
    name: "SelectorUCValue"
  },
  "00720070": {
    tag: "(0072,0070)",
    vr: "UT",
    vm: "1",
    name: "SelectorUTValue"
  },
  "00720071": {
    tag: "(0072,0071)",
    vr: "UR",
    vm: "1",
    name: "SelectorURValue"
  },
  "00720072": {
    tag: "(0072,0072)",
    vr: "DS",
    vm: "1-n",
    name: "SelectorDSValue"
  },
  "00720073": {
    tag: "(0072,0073)",
    vr: "OD",
    vm: "1",
    name: "SelectorODValue"
  },
  "00720074": {
    tag: "(0072,0074)",
    vr: "FD",
    vm: "1-n",
    name: "SelectorFDValue"
  },
  "00720075": {
    tag: "(0072,0075)",
    vr: "OL",
    vm: "1",
    name: "SelectorOLValue"
  },
  "00720076": {
    tag: "(0072,0076)",
    vr: "FL",
    vm: "1-n",
    name: "SelectorFLValue"
  },
  "00720078": {
    tag: "(0072,0078)",
    vr: "UL",
    vm: "1-n",
    name: "SelectorULValue"
  },
  "0072007A": {
    tag: "(0072,007A)",
    vr: "US",
    vm: "1-n",
    name: "SelectorUSValue"
  },
  "0072007C": {
    tag: "(0072,007C)",
    vr: "SL",
    vm: "1-n",
    name: "SelectorSLValue"
  },
  "0072007E": {
    tag: "(0072,007E)",
    vr: "SS",
    vm: "1-n",
    name: "SelectorSSValue"
  },
  "0072007F": {
    tag: "(0072,007F)",
    vr: "UI",
    vm: "1-n",
    name: "SelectorUIValue"
  },
  "00720080": {
    tag: "(0072,0080)",
    vr: "SQ",
    vm: "1",
    name: "SelectorCodeSequenceValue"
  },
  "00720100": {
    tag: "(0072,0100)",
    vr: "US",
    vm: "1",
    name: "NumberOfScreens"
  },
  "00720102": {
    tag: "(0072,0102)",
    vr: "SQ",
    vm: "1",
    name: "NominalScreenDefinitionSequence"
  },
  "00720104": {
    tag: "(0072,0104)",
    vr: "US",
    vm: "1",
    name: "NumberOfVerticalPixels"
  },
  "00720106": {
    tag: "(0072,0106)",
    vr: "US",
    vm: "1",
    name: "NumberOfHorizontalPixels"
  },
  "00720108": {
    tag: "(0072,0108)",
    vr: "FD",
    vm: "4",
    name: "DisplayEnvironmentSpatialPosition"
  },
  "0072010A": {
    tag: "(0072,010A)",
    vr: "US",
    vm: "1",
    name: "ScreenMinimumGrayscaleBitDepth"
  },
  "0072010C": {
    tag: "(0072,010C)",
    vr: "US",
    vm: "1",
    name: "ScreenMinimumColorBitDepth"
  },
  "0072010E": {
    tag: "(0072,010E)",
    vr: "US",
    vm: "1",
    name: "ApplicationMaximumRepaintTime"
  },
  "00720200": {
    tag: "(0072,0200)",
    vr: "SQ",
    vm: "1",
    name: "DisplaySetsSequence"
  },
  "00720202": {
    tag: "(0072,0202)",
    vr: "US",
    vm: "1",
    name: "DisplaySetNumber"
  },
  "00720203": {
    tag: "(0072,0203)",
    vr: "LO",
    vm: "1",
    name: "DisplaySetLabel"
  },
  "00720204": {
    tag: "(0072,0204)",
    vr: "US",
    vm: "1",
    name: "DisplaySetPresentationGroup"
  },
  "00720206": {
    tag: "(0072,0206)",
    vr: "LO",
    vm: "1",
    name: "DisplaySetPresentationGroupDescription"
  },
  "00720208": {
    tag: "(0072,0208)",
    vr: "CS",
    vm: "1",
    name: "PartialDataDisplayHandling"
  },
  "00720210": {
    tag: "(0072,0210)",
    vr: "SQ",
    vm: "1",
    name: "SynchronizedScrollingSequence"
  },
  "00720212": {
    tag: "(0072,0212)",
    vr: "US",
    vm: "2-n",
    name: "DisplaySetScrollingGroup"
  },
  "00720214": {
    tag: "(0072,0214)",
    vr: "SQ",
    vm: "1",
    name: "NavigationIndicatorSequence"
  },
  "00720216": {
    tag: "(0072,0216)",
    vr: "US",
    vm: "1",
    name: "NavigationDisplaySet"
  },
  "00720218": {
    tag: "(0072,0218)",
    vr: "US",
    vm: "1-n",
    name: "ReferenceDisplaySets"
  },
  "00720300": {
    tag: "(0072,0300)",
    vr: "SQ",
    vm: "1",
    name: "ImageBoxesSequence"
  },
  "00720302": {
    tag: "(0072,0302)",
    vr: "US",
    vm: "1",
    name: "ImageBoxNumber"
  },
  "00720304": {
    tag: "(0072,0304)",
    vr: "CS",
    vm: "1",
    name: "ImageBoxLayoutType"
  },
  "00720306": {
    tag: "(0072,0306)",
    vr: "US",
    vm: "1",
    name: "ImageBoxTileHorizontalDimension"
  },
  "00720308": {
    tag: "(0072,0308)",
    vr: "US",
    vm: "1",
    name: "ImageBoxTileVerticalDimension"
  },
  "00720310": {
    tag: "(0072,0310)",
    vr: "CS",
    vm: "1",
    name: "ImageBoxScrollDirection"
  },
  "00720312": {
    tag: "(0072,0312)",
    vr: "CS",
    vm: "1",
    name: "ImageBoxSmallScrollType"
  },
  "00720314": {
    tag: "(0072,0314)",
    vr: "US",
    vm: "1",
    name: "ImageBoxSmallScrollAmount"
  },
  "00720316": {
    tag: "(0072,0316)",
    vr: "CS",
    vm: "1",
    name: "ImageBoxLargeScrollType"
  },
  "00720318": {
    tag: "(0072,0318)",
    vr: "US",
    vm: "1",
    name: "ImageBoxLargeScrollAmount"
  },
  "00720320": {
    tag: "(0072,0320)",
    vr: "US",
    vm: "1",
    name: "ImageBoxOverlapPriority"
  },
  "00720330": {
    tag: "(0072,0330)",
    vr: "FD",
    vm: "1",
    name: "CineRelativeToRealTime"
  },
  "00720400": {
    tag: "(0072,0400)",
    vr: "SQ",
    vm: "1",
    name: "FilterOperationsSequence"
  },
  "00720402": {
    tag: "(0072,0402)",
    vr: "CS",
    vm: "1",
    name: "FilterByCategory"
  },
  "00720404": {
    tag: "(0072,0404)",
    vr: "CS",
    vm: "1",
    name: "FilterByAttributePresence"
  },
  "00720406": {
    tag: "(0072,0406)",
    vr: "CS",
    vm: "1",
    name: "FilterByOperator"
  },
  "00720420": {
    tag: "(0072,0420)",
    vr: "US",
    vm: "3",
    name: "StructuredDisplayBackgroundCIELabValue"
  },
  "00720421": {
    tag: "(0072,0421)",
    vr: "US",
    vm: "3",
    name: "EmptyImageBoxCIELabValue"
  },
  "00720422": {
    tag: "(0072,0422)",
    vr: "SQ",
    vm: "1",
    name: "StructuredDisplayImageBoxSequence"
  },
  "00720424": {
    tag: "(0072,0424)",
    vr: "SQ",
    vm: "1",
    name: "StructuredDisplayTextBoxSequence"
  },
  "00720427": {
    tag: "(0072,0427)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedFirstFrameSequence"
  },
  "00720430": {
    tag: "(0072,0430)",
    vr: "SQ",
    vm: "1",
    name: "ImageBoxSynchronizationSequence"
  },
  "00720432": {
    tag: "(0072,0432)",
    vr: "US",
    vm: "2-n",
    name: "SynchronizedImageBoxList"
  },
  "00720434": {
    tag: "(0072,0434)",
    vr: "CS",
    vm: "1",
    name: "TypeOfSynchronization"
  },
  "00720500": {
    tag: "(0072,0500)",
    vr: "CS",
    vm: "1",
    name: "BlendingOperationType"
  },
  "00720510": {
    tag: "(0072,0510)",
    vr: "CS",
    vm: "1",
    name: "ReformattingOperationType"
  },
  "00720512": {
    tag: "(0072,0512)",
    vr: "FD",
    vm: "1",
    name: "ReformattingThickness"
  },
  "00720514": {
    tag: "(0072,0514)",
    vr: "FD",
    vm: "1",
    name: "ReformattingInterval"
  },
  "00720516": {
    tag: "(0072,0516)",
    vr: "CS",
    vm: "1",
    name: "ReformattingOperationInitialViewDirection"
  },
  "00720520": {
    tag: "(0072,0520)",
    vr: "CS",
    vm: "1-n",
    name: "ThreeDRenderingType"
  },
  "00720600": {
    tag: "(0072,0600)",
    vr: "SQ",
    vm: "1",
    name: "SortingOperationsSequence"
  },
  "00720602": {
    tag: "(0072,0602)",
    vr: "CS",
    vm: "1",
    name: "SortByCategory"
  },
  "00720604": {
    tag: "(0072,0604)",
    vr: "CS",
    vm: "1",
    name: "SortingDirection"
  },
  "00720700": {
    tag: "(0072,0700)",
    vr: "CS",
    vm: "2",
    name: "DisplaySetPatientOrientation"
  },
  "00720702": {
    tag: "(0072,0702)",
    vr: "CS",
    vm: "1",
    name: "VOIType"
  },
  "00720704": {
    tag: "(0072,0704)",
    vr: "CS",
    vm: "1",
    name: "PseudoColorType"
  },
  "00720705": {
    tag: "(0072,0705)",
    vr: "SQ",
    vm: "1",
    name: "PseudoColorPaletteInstanceReferenceSequence"
  },
  "00720706": {
    tag: "(0072,0706)",
    vr: "CS",
    vm: "1",
    name: "ShowGrayscaleInverted"
  },
  "00720710": {
    tag: "(0072,0710)",
    vr: "CS",
    vm: "1",
    name: "ShowImageTrueSizeFlag"
  },
  "00720712": {
    tag: "(0072,0712)",
    vr: "CS",
    vm: "1",
    name: "ShowGraphicAnnotationFlag"
  },
  "00720714": {
    tag: "(0072,0714)",
    vr: "CS",
    vm: "1",
    name: "ShowPatientDemographicsFlag"
  },
  "00720716": {
    tag: "(0072,0716)",
    vr: "CS",
    vm: "1",
    name: "ShowAcquisitionTechniquesFlag"
  },
  "00720717": {
    tag: "(0072,0717)",
    vr: "CS",
    vm: "1",
    name: "DisplaySetHorizontalJustification"
  },
  "00720718": {
    tag: "(0072,0718)",
    vr: "CS",
    vm: "1",
    name: "DisplaySetVerticalJustification"
  },
  "00740120": {
    tag: "(0074,0120)",
    vr: "FD",
    vm: "1",
    name: "ContinuationStartMeterset"
  },
  "00740121": {
    tag: "(0074,0121)",
    vr: "FD",
    vm: "1",
    name: "ContinuationEndMeterset"
  },
  "00741000": {
    tag: "(0074,1000)",
    vr: "CS",
    vm: "1",
    name: "ProcedureStepState"
  },
  "00741002": {
    tag: "(0074,1002)",
    vr: "SQ",
    vm: "1",
    name: "ProcedureStepProgressInformationSequence"
  },
  "00741004": {
    tag: "(0074,1004)",
    vr: "DS",
    vm: "1",
    name: "ProcedureStepProgress"
  },
  "00741006": {
    tag: "(0074,1006)",
    vr: "ST",
    vm: "1",
    name: "ProcedureStepProgressDescription"
  },
  "00741007": {
    tag: "(0074,1007)",
    vr: "SQ",
    vm: "1",
    name: "ProcedureStepProgressParametersSequence"
  },
  "00741008": {
    tag: "(0074,1008)",
    vr: "SQ",
    vm: "1",
    name: "ProcedureStepCommunicationsURISequence"
  },
  "0074100A": {
    tag: "(0074,100A)",
    vr: "UR",
    vm: "1",
    name: "ContactURI"
  },
  "0074100C": {
    tag: "(0074,100C)",
    vr: "LO",
    vm: "1",
    name: "ContactDisplayName"
  },
  "0074100E": {
    tag: "(0074,100E)",
    vr: "SQ",
    vm: "1",
    name: "ProcedureStepDiscontinuationReasonCodeSequence"
  },
  "00741020": {
    tag: "(0074,1020)",
    vr: "SQ",
    vm: "1",
    name: "BeamTaskSequence"
  },
  "00741022": {
    tag: "(0074,1022)",
    vr: "CS",
    vm: "1",
    name: "BeamTaskType"
  },
  "00741024": {
    tag: "(0074,1024)",
    vr: "IS",
    vm: "1",
    name: "BeamOrderIndexTrial"
  },
  "00741025": {
    tag: "(0074,1025)",
    vr: "CS",
    vm: "1",
    name: "AutosequenceFlag"
  },
  "00741026": {
    tag: "(0074,1026)",
    vr: "FD",
    vm: "1",
    name: "TableTopVerticalAdjustedPosition"
  },
  "00741027": {
    tag: "(0074,1027)",
    vr: "FD",
    vm: "1",
    name: "TableTopLongitudinalAdjustedPosition"
  },
  "00741028": {
    tag: "(0074,1028)",
    vr: "FD",
    vm: "1",
    name: "TableTopLateralAdjustedPosition"
  },
  "0074102A": {
    tag: "(0074,102A)",
    vr: "FD",
    vm: "1",
    name: "PatientSupportAdjustedAngle"
  },
  "0074102B": {
    tag: "(0074,102B)",
    vr: "FD",
    vm: "1",
    name: "TableTopEccentricAdjustedAngle"
  },
  "0074102C": {
    tag: "(0074,102C)",
    vr: "FD",
    vm: "1",
    name: "TableTopPitchAdjustedAngle"
  },
  "0074102D": {
    tag: "(0074,102D)",
    vr: "FD",
    vm: "1",
    name: "TableTopRollAdjustedAngle"
  },
  "00741030": {
    tag: "(0074,1030)",
    vr: "SQ",
    vm: "1",
    name: "DeliveryVerificationImageSequence"
  },
  "00741032": {
    tag: "(0074,1032)",
    vr: "CS",
    vm: "1",
    name: "VerificationImageTiming"
  },
  "00741034": {
    tag: "(0074,1034)",
    vr: "CS",
    vm: "1",
    name: "DoubleExposureFlag"
  },
  "00741036": {
    tag: "(0074,1036)",
    vr: "CS",
    vm: "1",
    name: "DoubleExposureOrdering"
  },
  "00741038": {
    tag: "(0074,1038)",
    vr: "DS",
    vm: "1",
    name: "DoubleExposureMetersetTrial"
  },
  "0074103A": {
    tag: "(0074,103A)",
    vr: "DS",
    vm: "4",
    name: "DoubleExposureFieldDeltaTrial"
  },
  "00741040": {
    tag: "(0074,1040)",
    vr: "SQ",
    vm: "1",
    name: "RelatedReferenceRTImageSequence"
  },
  "00741042": {
    tag: "(0074,1042)",
    vr: "SQ",
    vm: "1",
    name: "GeneralMachineVerificationSequence"
  },
  "00741044": {
    tag: "(0074,1044)",
    vr: "SQ",
    vm: "1",
    name: "ConventionalMachineVerificationSequence"
  },
  "00741046": {
    tag: "(0074,1046)",
    vr: "SQ",
    vm: "1",
    name: "IonMachineVerificationSequence"
  },
  "00741048": {
    tag: "(0074,1048)",
    vr: "SQ",
    vm: "1",
    name: "FailedAttributesSequence"
  },
  "0074104A": {
    tag: "(0074,104A)",
    vr: "SQ",
    vm: "1",
    name: "OverriddenAttributesSequence"
  },
  "0074104C": {
    tag: "(0074,104C)",
    vr: "SQ",
    vm: "1",
    name: "ConventionalControlPointVerificationSequence"
  },
  "0074104E": {
    tag: "(0074,104E)",
    vr: "SQ",
    vm: "1",
    name: "IonControlPointVerificationSequence"
  },
  "00741050": {
    tag: "(0074,1050)",
    vr: "SQ",
    vm: "1",
    name: "AttributeOccurrenceSequence"
  },
  "00741052": {
    tag: "(0074,1052)",
    vr: "AT",
    vm: "1",
    name: "AttributeOccurrencePointer"
  },
  "00741054": {
    tag: "(0074,1054)",
    vr: "UL",
    vm: "1",
    name: "AttributeItemSelector"
  },
  "00741056": {
    tag: "(0074,1056)",
    vr: "LO",
    vm: "1",
    name: "AttributeOccurrencePrivateCreator"
  },
  "00741057": {
    tag: "(0074,1057)",
    vr: "IS",
    vm: "1-n",
    name: "SelectorSequencePointerItems"
  },
  "00741200": {
    tag: "(0074,1200)",
    vr: "CS",
    vm: "1",
    name: "ScheduledProcedureStepPriority"
  },
  "00741202": {
    tag: "(0074,1202)",
    vr: "LO",
    vm: "1",
    name: "WorklistLabel"
  },
  "00741204": {
    tag: "(0074,1204)",
    vr: "LO",
    vm: "1",
    name: "ProcedureStepLabel"
  },
  "00741210": {
    tag: "(0074,1210)",
    vr: "SQ",
    vm: "1",
    name: "ScheduledProcessingParametersSequence"
  },
  "00741212": {
    tag: "(0074,1212)",
    vr: "SQ",
    vm: "1",
    name: "PerformedProcessingParametersSequence"
  },
  "00741216": {
    tag: "(0074,1216)",
    vr: "SQ",
    vm: "1",
    name: "UnifiedProcedureStepPerformedProcedureSequence"
  },
  "00741220": {
    tag: "(0074,1220)",
    vr: "SQ",
    vm: "1",
    name: "RelatedProcedureStepSequence"
  },
  "00741222": {
    tag: "(0074,1222)",
    vr: "LO",
    vm: "1",
    name: "ProcedureStepRelationshipType"
  },
  "00741224": {
    tag: "(0074,1224)",
    vr: "SQ",
    vm: "1",
    name: "ReplacedProcedureStepSequence"
  },
  "00741230": {
    tag: "(0074,1230)",
    vr: "LO",
    vm: "1",
    name: "DeletionLock"
  },
  "00741234": {
    tag: "(0074,1234)",
    vr: "AE",
    vm: "1",
    name: "ReceivingAE"
  },
  "00741236": {
    tag: "(0074,1236)",
    vr: "AE",
    vm: "1",
    name: "RequestingAE"
  },
  "00741238": {
    tag: "(0074,1238)",
    vr: "LT",
    vm: "1",
    name: "ReasonForCancellation"
  },
  "00741242": {
    tag: "(0074,1242)",
    vr: "CS",
    vm: "1",
    name: "SCPStatus"
  },
  "00741244": {
    tag: "(0074,1244)",
    vr: "CS",
    vm: "1",
    name: "SubscriptionListStatus"
  },
  "00741246": {
    tag: "(0074,1246)",
    vr: "CS",
    vm: "1",
    name: "UnifiedProcedureStepListStatus"
  },
  "00741324": {
    tag: "(0074,1324)",
    vr: "UL",
    vm: "1",
    name: "BeamOrderIndex"
  },
  "00741338": {
    tag: "(0074,1338)",
    vr: "FD",
    vm: "1",
    name: "DoubleExposureMeterset"
  },
  "0074133A": {
    tag: "(0074,133A)",
    vr: "FD",
    vm: "4",
    name: "DoubleExposureFieldDelta"
  },
  "00741401": {
    tag: "(0074,1401)",
    vr: "SQ",
    vm: "1",
    name: "BrachyTaskSequence"
  },
  "00741402": {
    tag: "(0074,1402)",
    vr: "DS",
    vm: "1",
    name: "ContinuationStartTotalReferenceAirKerma"
  },
  "00741403": {
    tag: "(0074,1403)",
    vr: "DS",
    vm: "1",
    name: "ContinuationEndTotalReferenceAirKerma"
  },
  "00741404": {
    tag: "(0074,1404)",
    vr: "IS",
    vm: "1",
    name: "ContinuationPulseNumber"
  },
  "00741405": {
    tag: "(0074,1405)",
    vr: "SQ",
    vm: "1",
    name: "ChannelDeliveryOrderSequence"
  },
  "00741406": {
    tag: "(0074,1406)",
    vr: "IS",
    vm: "1",
    name: "ReferencedChannelNumber"
  },
  "00741407": {
    tag: "(0074,1407)",
    vr: "DS",
    vm: "1",
    name: "StartCumulativeTimeWeight"
  },
  "00741408": {
    tag: "(0074,1408)",
    vr: "DS",
    vm: "1",
    name: "EndCumulativeTimeWeight"
  },
  "00741409": {
    tag: "(0074,1409)",
    vr: "SQ",
    vm: "1",
    name: "OmittedChannelSequence"
  },
  "0074140A": {
    tag: "(0074,140A)",
    vr: "CS",
    vm: "1",
    name: "ReasonForChannelOmission"
  },
  "0074140B": {
    tag: "(0074,140B)",
    vr: "LO",
    vm: "1",
    name: "ReasonForChannelOmissionDescription"
  },
  "0074140C": {
    tag: "(0074,140C)",
    vr: "IS",
    vm: "1",
    name: "ChannelDeliveryOrderIndex"
  },
  "0074140D": {
    tag: "(0074,140D)",
    vr: "SQ",
    vm: "1",
    name: "ChannelDeliveryContinuationSequence"
  },
  "0074140E": {
    tag: "(0074,140E)",
    vr: "SQ",
    vm: "1",
    name: "OmittedApplicationSetupSequence"
  },
  "00760001": {
    tag: "(0076,0001)",
    vr: "LO",
    vm: "1",
    name: "ImplantAssemblyTemplateName"
  },
  "00760003": {
    tag: "(0076,0003)",
    vr: "LO",
    vm: "1",
    name: "ImplantAssemblyTemplateIssuer"
  },
  "00760006": {
    tag: "(0076,0006)",
    vr: "LO",
    vm: "1",
    name: "ImplantAssemblyTemplateVersion"
  },
  "00760008": {
    tag: "(0076,0008)",
    vr: "SQ",
    vm: "1",
    name: "ReplacedImplantAssemblyTemplateSequence"
  },
  "0076000A": {
    tag: "(0076,000A)",
    vr: "CS",
    vm: "1",
    name: "ImplantAssemblyTemplateType"
  },
  "0076000C": {
    tag: "(0076,000C)",
    vr: "SQ",
    vm: "1",
    name: "OriginalImplantAssemblyTemplateSequence"
  },
  "0076000E": {
    tag: "(0076,000E)",
    vr: "SQ",
    vm: "1",
    name: "DerivationImplantAssemblyTemplateSequence"
  },
  "00760010": {
    tag: "(0076,0010)",
    vr: "SQ",
    vm: "1",
    name: "ImplantAssemblyTemplateTargetAnatomySequence"
  },
  "00760020": {
    tag: "(0076,0020)",
    vr: "SQ",
    vm: "1",
    name: "ProcedureTypeCodeSequence"
  },
  "00760030": {
    tag: "(0076,0030)",
    vr: "LO",
    vm: "1",
    name: "SurgicalTechnique"
  },
  "00760032": {
    tag: "(0076,0032)",
    vr: "SQ",
    vm: "1",
    name: "ComponentTypesSequence"
  },
  "00760034": {
    tag: "(0076,0034)",
    vr: "SQ",
    vm: "1",
    name: "ComponentTypeCodeSequence"
  },
  "00760036": {
    tag: "(0076,0036)",
    vr: "CS",
    vm: "1",
    name: "ExclusiveComponentType"
  },
  "00760038": {
    tag: "(0076,0038)",
    vr: "CS",
    vm: "1",
    name: "MandatoryComponentType"
  },
  "00760040": {
    tag: "(0076,0040)",
    vr: "SQ",
    vm: "1",
    name: "ComponentSequence"
  },
  "00760055": {
    tag: "(0076,0055)",
    vr: "US",
    vm: "1",
    name: "ComponentID"
  },
  "00760060": {
    tag: "(0076,0060)",
    vr: "SQ",
    vm: "1",
    name: "ComponentAssemblySequence"
  },
  "00760070": {
    tag: "(0076,0070)",
    vr: "US",
    vm: "1",
    name: "Component1ReferencedID"
  },
  "00760080": {
    tag: "(0076,0080)",
    vr: "US",
    vm: "1",
    name: "Component1ReferencedMatingFeatureSetID"
  },
  "00760090": {
    tag: "(0076,0090)",
    vr: "US",
    vm: "1",
    name: "Component1ReferencedMatingFeatureID"
  },
  "007600A0": {
    tag: "(0076,00A0)",
    vr: "US",
    vm: "1",
    name: "Component2ReferencedID"
  },
  "007600B0": {
    tag: "(0076,00B0)",
    vr: "US",
    vm: "1",
    name: "Component2ReferencedMatingFeatureSetID"
  },
  "007600C0": {
    tag: "(0076,00C0)",
    vr: "US",
    vm: "1",
    name: "Component2ReferencedMatingFeatureID"
  },
  "00780001": {
    tag: "(0078,0001)",
    vr: "LO",
    vm: "1",
    name: "ImplantTemplateGroupName"
  },
  "00780010": {
    tag: "(0078,0010)",
    vr: "ST",
    vm: "1",
    name: "ImplantTemplateGroupDescription"
  },
  "00780020": {
    tag: "(0078,0020)",
    vr: "LO",
    vm: "1",
    name: "ImplantTemplateGroupIssuer"
  },
  "00780024": {
    tag: "(0078,0024)",
    vr: "LO",
    vm: "1",
    name: "ImplantTemplateGroupVersion"
  },
  "00780026": {
    tag: "(0078,0026)",
    vr: "SQ",
    vm: "1",
    name: "ReplacedImplantTemplateGroupSequence"
  },
  "00780028": {
    tag: "(0078,0028)",
    vr: "SQ",
    vm: "1",
    name: "ImplantTemplateGroupTargetAnatomySequence"
  },
  "0078002A": {
    tag: "(0078,002A)",
    vr: "SQ",
    vm: "1",
    name: "ImplantTemplateGroupMembersSequence"
  },
  "0078002E": {
    tag: "(0078,002E)",
    vr: "US",
    vm: "1",
    name: "ImplantTemplateGroupMemberID"
  },
  "00780050": {
    tag: "(0078,0050)",
    vr: "FD",
    vm: "3",
    name: "ThreeDImplantTemplateGroupMemberMatchingPoint"
  },
  "00780060": {
    tag: "(0078,0060)",
    vr: "FD",
    vm: "9",
    name: "ThreeDImplantTemplateGroupMemberMatchingAxes"
  },
  "00780070": {
    tag: "(0078,0070)",
    vr: "SQ",
    vm: "1",
    name: "ImplantTemplateGroupMemberMatching2DCoordinatesSequence"
  },
  "00780090": {
    tag: "(0078,0090)",
    vr: "FD",
    vm: "2",
    name: "TwoDImplantTemplateGroupMemberMatchingPoint"
  },
  "007800A0": {
    tag: "(0078,00A0)",
    vr: "FD",
    vm: "4",
    name: "TwoDImplantTemplateGroupMemberMatchingAxes"
  },
  "007800B0": {
    tag: "(0078,00B0)",
    vr: "SQ",
    vm: "1",
    name: "ImplantTemplateGroupVariationDimensionSequence"
  },
  "007800B2": {
    tag: "(0078,00B2)",
    vr: "LO",
    vm: "1",
    name: "ImplantTemplateGroupVariationDimensionName"
  },
  "007800B4": {
    tag: "(0078,00B4)",
    vr: "SQ",
    vm: "1",
    name: "ImplantTemplateGroupVariationDimensionRankSequence"
  },
  "007800B6": {
    tag: "(0078,00B6)",
    vr: "US",
    vm: "1",
    name: "ReferencedImplantTemplateGroupMemberID"
  },
  "007800B8": {
    tag: "(0078,00B8)",
    vr: "US",
    vm: "1",
    name: "ImplantTemplateGroupVariationDimensionRank"
  },
  "00800001": {
    tag: "(0080,0001)",
    vr: "SQ",
    vm: "1",
    name: "SurfaceScanAcquisitionTypeCodeSequence"
  },
  "00800002": {
    tag: "(0080,0002)",
    vr: "SQ",
    vm: "1",
    name: "SurfaceScanModeCodeSequence"
  },
  "00800003": {
    tag: "(0080,0003)",
    vr: "SQ",
    vm: "1",
    name: "RegistrationMethodCodeSequence"
  },
  "00800004": {
    tag: "(0080,0004)",
    vr: "FD",
    vm: "1",
    name: "ShotDurationTime"
  },
  "00800005": {
    tag: "(0080,0005)",
    vr: "FD",
    vm: "1",
    name: "ShotOffsetTime"
  },
  "00800006": {
    tag: "(0080,0006)",
    vr: "US",
    vm: "1-n",
    name: "SurfacePointPresentationValueData"
  },
  "00800007": {
    tag: "(0080,0007)",
    vr: "US",
    vm: "3-3n",
    name: "SurfacePointColorCIELabValueData"
  },
  "00800008": {
    tag: "(0080,0008)",
    vr: "SQ",
    vm: "1",
    name: "UVMappingSequence"
  },
  "00800009": {
    tag: "(0080,0009)",
    vr: "SH",
    vm: "1",
    name: "TextureLabel"
  },
  "00800010": {
    tag: "(0080,0010)",
    vr: "OF",
    vm: "1",
    name: "UValueData"
  },
  "00800011": {
    tag: "(0080,0011)",
    vr: "OF",
    vm: "1",
    name: "VValueData"
  },
  "00800012": {
    tag: "(0080,0012)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedTextureSequence"
  },
  "00800013": {
    tag: "(0080,0013)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedSurfaceDataSequence"
  },
  "00820001": {
    tag: "(0082,0001)",
    vr: "CS",
    vm: "1",
    name: "AssessmentSummary"
  },
  "00820003": {
    tag: "(0082,0003)",
    vr: "UT",
    vm: "1",
    name: "AssessmentSummaryDescription"
  },
  "00820004": {
    tag: "(0082,0004)",
    vr: "SQ",
    vm: "1",
    name: "AssessedSOPInstanceSequence"
  },
  "00820005": {
    tag: "(0082,0005)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedComparisonSOPInstanceSequence"
  },
  "00820006": {
    tag: "(0082,0006)",
    vr: "UL",
    vm: "1",
    name: "NumberOfAssessmentObservations"
  },
  "00820007": {
    tag: "(0082,0007)",
    vr: "SQ",
    vm: "1",
    name: "AssessmentObservationsSequence"
  },
  "00820008": {
    tag: "(0082,0008)",
    vr: "CS",
    vm: "1",
    name: "ObservationSignificance"
  },
  "0082000A": {
    tag: "(0082,000A)",
    vr: "UT",
    vm: "1",
    name: "ObservationDescription"
  },
  "0082000C": {
    tag: "(0082,000C)",
    vr: "SQ",
    vm: "1",
    name: "StructuredConstraintObservationSequence"
  },
  "00820010": {
    tag: "(0082,0010)",
    vr: "SQ",
    vm: "1",
    name: "AssessedAttributeValueSequence"
  },
  "00820016": {
    tag: "(0082,0016)",
    vr: "LO",
    vm: "1",
    name: "AssessmentSetID"
  },
  "00820017": {
    tag: "(0082,0017)",
    vr: "SQ",
    vm: "1",
    name: "AssessmentRequesterSequence"
  },
  "00820018": {
    tag: "(0082,0018)",
    vr: "LO",
    vm: "1",
    name: "SelectorAttributeName"
  },
  "00820019": {
    tag: "(0082,0019)",
    vr: "LO",
    vm: "1",
    name: "SelectorAttributeKeyword"
  },
  "00820021": {
    tag: "(0082,0021)",
    vr: "SQ",
    vm: "1",
    name: "AssessmentTypeCodeSequence"
  },
  "00820022": {
    tag: "(0082,0022)",
    vr: "SQ",
    vm: "1",
    name: "ObservationBasisCodeSequence"
  },
  "00820023": {
    tag: "(0082,0023)",
    vr: "LO",
    vm: "1",
    name: "AssessmentLabel"
  },
  "00820032": {
    tag: "(0082,0032)",
    vr: "CS",
    vm: "1",
    name: "ConstraintType"
  },
  "00820033": {
    tag: "(0082,0033)",
    vr: "UT",
    vm: "1",
    name: "SpecificationSelectionGuidance"
  },
  "00820034": {
    tag: "(0082,0034)",
    vr: "SQ",
    vm: "1",
    name: "ConstraintValueSequence"
  },
  "00820035": {
    tag: "(0082,0035)",
    vr: "SQ",
    vm: "1",
    name: "RecommendedDefaultValueSequence"
  },
  "00820036": {
    tag: "(0082,0036)",
    vr: "CS",
    vm: "1",
    name: "ConstraintViolationSignificance"
  },
  "00820037": {
    tag: "(0082,0037)",
    vr: "UT",
    vm: "1",
    name: "ConstraintViolationCondition"
  },
  "00820038": {
    tag: "(0082,0038)",
    vr: "CS",
    vm: "1",
    name: "ModifiableConstraintFlag"
  },
  "00880130": {
    tag: "(0088,0130)",
    vr: "SH",
    vm: "1",
    name: "StorageMediaFileSetID"
  },
  "00880140": {
    tag: "(0088,0140)",
    vr: "UI",
    vm: "1",
    name: "StorageMediaFileSetUID"
  },
  "00880200": {
    tag: "(0088,0200)",
    vr: "SQ",
    vm: "1",
    name: "IconImageSequence"
  },
  "00880904": {
    tag: "(0088,0904)",
    vr: "LO",
    vm: "1",
    name: "TopicTitle"
  },
  "00880906": {
    tag: "(0088,0906)",
    vr: "ST",
    vm: "1",
    name: "TopicSubject"
  },
  "00880910": {
    tag: "(0088,0910)",
    vr: "LO",
    vm: "1",
    name: "TopicAuthor"
  },
  "00880912": {
    tag: "(0088,0912)",
    vr: "LO",
    vm: "1-32",
    name: "TopicKeywords"
  },
  "01000410": {
    tag: "(0100,0410)",
    vr: "CS",
    vm: "1",
    name: "SOPInstanceStatus"
  },
  "01000420": {
    tag: "(0100,0420)",
    vr: "DT",
    vm: "1",
    name: "SOPAuthorizationDateTime"
  },
  "01000424": {
    tag: "(0100,0424)",
    vr: "LT",
    vm: "1",
    name: "SOPAuthorizationComment"
  },
  "01000426": {
    tag: "(0100,0426)",
    vr: "LO",
    vm: "1",
    name: "AuthorizationEquipmentCertificationNumber"
  },
  "04000005": {
    tag: "(0400,0005)",
    vr: "US",
    vm: "1",
    name: "MACIDNumber"
  },
  "04000010": {
    tag: "(0400,0010)",
    vr: "UI",
    vm: "1",
    name: "MACCalculationTransferSyntaxUID"
  },
  "04000015": {
    tag: "(0400,0015)",
    vr: "CS",
    vm: "1",
    name: "MACAlgorithm"
  },
  "04000020": {
    tag: "(0400,0020)",
    vr: "AT",
    vm: "1-n",
    name: "DataElementsSigned"
  },
  "04000100": {
    tag: "(0400,0100)",
    vr: "UI",
    vm: "1",
    name: "DigitalSignatureUID"
  },
  "04000105": {
    tag: "(0400,0105)",
    vr: "DT",
    vm: "1",
    name: "DigitalSignatureDateTime"
  },
  "04000110": {
    tag: "(0400,0110)",
    vr: "CS",
    vm: "1",
    name: "CertificateType"
  },
  "04000115": {
    tag: "(0400,0115)",
    vr: "OB",
    vm: "1",
    name: "CertificateOfSigner"
  },
  "04000120": {
    tag: "(0400,0120)",
    vr: "OB",
    vm: "1",
    name: "Signature"
  },
  "04000305": {
    tag: "(0400,0305)",
    vr: "CS",
    vm: "1",
    name: "CertifiedTimestampType"
  },
  "04000310": {
    tag: "(0400,0310)",
    vr: "OB",
    vm: "1",
    name: "CertifiedTimestamp"
  },
  "04000315": {
    tag: "(0400,0315)",
    vr: "FL",
    vm: "1",
    name: ""
  },
  "04000401": {
    tag: "(0400,0401)",
    vr: "SQ",
    vm: "1",
    name: "DigitalSignaturePurposeCodeSequence"
  },
  "04000402": {
    tag: "(0400,0402)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedDigitalSignatureSequence"
  },
  "04000403": {
    tag: "(0400,0403)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedSOPInstanceMACSequence"
  },
  "04000404": {
    tag: "(0400,0404)",
    vr: "OB",
    vm: "1",
    name: "MAC"
  },
  "04000500": {
    tag: "(0400,0500)",
    vr: "SQ",
    vm: "1",
    name: "EncryptedAttributesSequence"
  },
  "04000510": {
    tag: "(0400,0510)",
    vr: "UI",
    vm: "1",
    name: "EncryptedContentTransferSyntaxUID"
  },
  "04000520": {
    tag: "(0400,0520)",
    vr: "OB",
    vm: "1",
    name: "EncryptedContent"
  },
  "04000550": {
    tag: "(0400,0550)",
    vr: "SQ",
    vm: "1",
    name: "ModifiedAttributesSequence"
  },
  "04000561": {
    tag: "(0400,0561)",
    vr: "SQ",
    vm: "1",
    name: "OriginalAttributesSequence"
  },
  "04000562": {
    tag: "(0400,0562)",
    vr: "DT",
    vm: "1",
    name: "AttributeModificationDateTime"
  },
  "04000563": {
    tag: "(0400,0563)",
    vr: "LO",
    vm: "1",
    name: "ModifyingSystem"
  },
  "04000564": {
    tag: "(0400,0564)",
    vr: "LO",
    vm: "1",
    name: "SourceOfPreviousValues"
  },
  "04000565": {
    tag: "(0400,0565)",
    vr: "CS",
    vm: "1",
    name: "ReasonForTheAttributeModification"
  },
  "1000xxx0": {
    tag: "(1000,xxx0)",
    vr: "US",
    vm: "3",
    name: "EscapeTriplet"
  },
  "1000xxx1": {
    tag: "(1000,xxx1)",
    vr: "US",
    vm: "3",
    name: "RunLengthTriplet"
  },
  "1000xxx2": {
    tag: "(1000,xxx2)",
    vr: "US",
    vm: "1",
    name: "HuffmanTableSize"
  },
  "1000xxx3": {
    tag: "(1000,xxx3)",
    vr: "US",
    vm: "3",
    name: "HuffmanTableTriplet"
  },
  "1000xxx4": {
    tag: "(1000,xxx4)",
    vr: "US",
    vm: "1",
    name: "ShiftTableSize"
  },
  "1000xxx5": {
    tag: "(1000,xxx5)",
    vr: "US",
    vm: "3",
    name: "ShiftTableTriplet"
  },
  "1010xxxx": {
    tag: "(1010,xxxx)",
    vr: "US",
    vm: "1-n",
    name: "ZonalMap"
  },
  20000010: {
    tag: "(2000,0010)",
    vr: "IS",
    vm: "1",
    name: "NumberOfCopies"
  },
  "2000001E": {
    tag: "(2000,001E)",
    vr: "SQ",
    vm: "1",
    name: "PrinterConfigurationSequence"
  },
  20000020: {
    tag: "(2000,0020)",
    vr: "CS",
    vm: "1",
    name: "PrintPriority"
  },
  20000030: {
    tag: "(2000,0030)",
    vr: "CS",
    vm: "1",
    name: "MediumType"
  },
  20000040: {
    tag: "(2000,0040)",
    vr: "CS",
    vm: "1",
    name: "FilmDestination"
  },
  20000050: {
    tag: "(2000,0050)",
    vr: "LO",
    vm: "1",
    name: "FilmSessionLabel"
  },
  20000060: {
    tag: "(2000,0060)",
    vr: "IS",
    vm: "1",
    name: "MemoryAllocation"
  },
  20000061: {
    tag: "(2000,0061)",
    vr: "IS",
    vm: "1",
    name: "MaximumMemoryAllocation"
  },
  20000062: {
    tag: "(2000,0062)",
    vr: "CS",
    vm: "1",
    name: "ColorImagePrintingFlag"
  },
  20000063: {
    tag: "(2000,0063)",
    vr: "CS",
    vm: "1",
    name: "CollationFlag"
  },
  20000065: {
    tag: "(2000,0065)",
    vr: "CS",
    vm: "1",
    name: "AnnotationFlag"
  },
  20000067: {
    tag: "(2000,0067)",
    vr: "CS",
    vm: "1",
    name: "ImageOverlayFlag"
  },
  20000069: {
    tag: "(2000,0069)",
    vr: "CS",
    vm: "1",
    name: "PresentationLUTFlag"
  },
  "2000006A": {
    tag: "(2000,006A)",
    vr: "CS",
    vm: "1",
    name: "ImageBoxPresentationLUTFlag"
  },
  "200000A0": {
    tag: "(2000,00A0)",
    vr: "US",
    vm: "1",
    name: "MemoryBitDepth"
  },
  "200000A1": {
    tag: "(2000,00A1)",
    vr: "US",
    vm: "1",
    name: "PrintingBitDepth"
  },
  "200000A2": {
    tag: "(2000,00A2)",
    vr: "SQ",
    vm: "1",
    name: "MediaInstalledSequence"
  },
  "200000A4": {
    tag: "(2000,00A4)",
    vr: "SQ",
    vm: "1",
    name: "OtherMediaAvailableSequence"
  },
  "200000A8": {
    tag: "(2000,00A8)",
    vr: "SQ",
    vm: "1",
    name: "SupportedImageDisplayFormatsSequence"
  },
  20000500: {
    tag: "(2000,0500)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedFilmBoxSequence"
  },
  20000510: {
    tag: "(2000,0510)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedStoredPrintSequence"
  },
  20100010: {
    tag: "(2010,0010)",
    vr: "ST",
    vm: "1",
    name: "ImageDisplayFormat"
  },
  20100030: {
    tag: "(2010,0030)",
    vr: "CS",
    vm: "1",
    name: "AnnotationDisplayFormatID"
  },
  20100040: {
    tag: "(2010,0040)",
    vr: "CS",
    vm: "1",
    name: "FilmOrientation"
  },
  20100050: {
    tag: "(2010,0050)",
    vr: "CS",
    vm: "1",
    name: "FilmSizeID"
  },
  20100052: {
    tag: "(2010,0052)",
    vr: "CS",
    vm: "1",
    name: "PrinterResolutionID"
  },
  20100054: {
    tag: "(2010,0054)",
    vr: "CS",
    vm: "1",
    name: "DefaultPrinterResolutionID"
  },
  20100060: {
    tag: "(2010,0060)",
    vr: "CS",
    vm: "1",
    name: "MagnificationType"
  },
  20100080: {
    tag: "(2010,0080)",
    vr: "CS",
    vm: "1",
    name: "SmoothingType"
  },
  "201000A6": {
    tag: "(2010,00A6)",
    vr: "CS",
    vm: "1",
    name: "DefaultMagnificationType"
  },
  "201000A7": {
    tag: "(2010,00A7)",
    vr: "CS",
    vm: "1-n",
    name: "OtherMagnificationTypesAvailable"
  },
  "201000A8": {
    tag: "(2010,00A8)",
    vr: "CS",
    vm: "1",
    name: "DefaultSmoothingType"
  },
  "201000A9": {
    tag: "(2010,00A9)",
    vr: "CS",
    vm: "1-n",
    name: "OtherSmoothingTypesAvailable"
  },
  20100100: {
    tag: "(2010,0100)",
    vr: "CS",
    vm: "1",
    name: "BorderDensity"
  },
  20100110: {
    tag: "(2010,0110)",
    vr: "CS",
    vm: "1",
    name: "EmptyImageDensity"
  },
  20100120: {
    tag: "(2010,0120)",
    vr: "US",
    vm: "1",
    name: "MinDensity"
  },
  20100130: {
    tag: "(2010,0130)",
    vr: "US",
    vm: "1",
    name: "MaxDensity"
  },
  20100140: {
    tag: "(2010,0140)",
    vr: "CS",
    vm: "1",
    name: "Trim"
  },
  20100150: {
    tag: "(2010,0150)",
    vr: "ST",
    vm: "1",
    name: "ConfigurationInformation"
  },
  20100152: {
    tag: "(2010,0152)",
    vr: "LT",
    vm: "1",
    name: "ConfigurationInformationDescription"
  },
  20100154: {
    tag: "(2010,0154)",
    vr: "IS",
    vm: "1",
    name: "MaximumCollatedFilms"
  },
  "2010015E": {
    tag: "(2010,015E)",
    vr: "US",
    vm: "1",
    name: "Illumination"
  },
  20100160: {
    tag: "(2010,0160)",
    vr: "US",
    vm: "1",
    name: "ReflectedAmbientLight"
  },
  20100376: {
    tag: "(2010,0376)",
    vr: "DS",
    vm: "2",
    name: "PrinterPixelSpacing"
  },
  20100500: {
    tag: "(2010,0500)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedFilmSessionSequence"
  },
  20100510: {
    tag: "(2010,0510)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedImageBoxSequence"
  },
  20100520: {
    tag: "(2010,0520)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedBasicAnnotationBoxSequence"
  },
  20200010: {
    tag: "(2020,0010)",
    vr: "US",
    vm: "1",
    name: "ImageBoxPosition"
  },
  20200020: {
    tag: "(2020,0020)",
    vr: "CS",
    vm: "1",
    name: "Polarity"
  },
  20200030: {
    tag: "(2020,0030)",
    vr: "DS",
    vm: "1",
    name: "RequestedImageSize"
  },
  20200040: {
    tag: "(2020,0040)",
    vr: "CS",
    vm: "1",
    name: "RequestedDecimateCropBehavior"
  },
  20200050: {
    tag: "(2020,0050)",
    vr: "CS",
    vm: "1",
    name: "RequestedResolutionID"
  },
  "202000A0": {
    tag: "(2020,00A0)",
    vr: "CS",
    vm: "1",
    name: "RequestedImageSizeFlag"
  },
  "202000A2": {
    tag: "(2020,00A2)",
    vr: "CS",
    vm: "1",
    name: "DecimateCropResult"
  },
  20200110: {
    tag: "(2020,0110)",
    vr: "SQ",
    vm: "1",
    name: "BasicGrayscaleImageSequence"
  },
  20200111: {
    tag: "(2020,0111)",
    vr: "SQ",
    vm: "1",
    name: "BasicColorImageSequence"
  },
  20200130: {
    tag: "(2020,0130)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedImageOverlayBoxSequence"
  },
  20200140: {
    tag: "(2020,0140)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedVOILUTBoxSequence"
  },
  20300010: {
    tag: "(2030,0010)",
    vr: "US",
    vm: "1",
    name: "AnnotationPosition"
  },
  20300020: {
    tag: "(2030,0020)",
    vr: "LO",
    vm: "1",
    name: "TextString"
  },
  20400010: {
    tag: "(2040,0010)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedOverlayPlaneSequence"
  },
  20400011: {
    tag: "(2040,0011)",
    vr: "US",
    vm: "1-99",
    name: "ReferencedOverlayPlaneGroups"
  },
  20400020: {
    tag: "(2040,0020)",
    vr: "SQ",
    vm: "1",
    name: "OverlayPixelDataSequence"
  },
  20400060: {
    tag: "(2040,0060)",
    vr: "CS",
    vm: "1",
    name: "OverlayMagnificationType"
  },
  20400070: {
    tag: "(2040,0070)",
    vr: "CS",
    vm: "1",
    name: "OverlaySmoothingType"
  },
  20400072: {
    tag: "(2040,0072)",
    vr: "CS",
    vm: "1",
    name: "OverlayOrImageMagnification"
  },
  20400074: {
    tag: "(2040,0074)",
    vr: "US",
    vm: "1",
    name: "MagnifyToNumberOfColumns"
  },
  20400080: {
    tag: "(2040,0080)",
    vr: "CS",
    vm: "1",
    name: "OverlayForegroundDensity"
  },
  20400082: {
    tag: "(2040,0082)",
    vr: "CS",
    vm: "1",
    name: "OverlayBackgroundDensity"
  },
  20400090: {
    tag: "(2040,0090)",
    vr: "CS",
    vm: "1",
    name: "OverlayMode"
  },
  20400100: {
    tag: "(2040,0100)",
    vr: "CS",
    vm: "1",
    name: "ThresholdDensity"
  },
  20400500: {
    tag: "(2040,0500)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedImageBoxSequenceRetired"
  },
  20500010: {
    tag: "(2050,0010)",
    vr: "SQ",
    vm: "1",
    name: "PresentationLUTSequence"
  },
  20500020: {
    tag: "(2050,0020)",
    vr: "CS",
    vm: "1",
    name: "PresentationLUTShape"
  },
  20500500: {
    tag: "(2050,0500)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPresentationLUTSequence"
  },
  21000010: {
    tag: "(2100,0010)",
    vr: "SH",
    vm: "1",
    name: "PrintJobID"
  },
  21000020: {
    tag: "(2100,0020)",
    vr: "CS",
    vm: "1",
    name: "ExecutionStatus"
  },
  21000030: {
    tag: "(2100,0030)",
    vr: "CS",
    vm: "1",
    name: "ExecutionStatusInfo"
  },
  21000040: {
    tag: "(2100,0040)",
    vr: "DA",
    vm: "1",
    name: "CreationDate"
  },
  21000050: {
    tag: "(2100,0050)",
    vr: "TM",
    vm: "1",
    name: "CreationTime"
  },
  21000070: {
    tag: "(2100,0070)",
    vr: "AE",
    vm: "1",
    name: "Originator"
  },
  21000140: {
    tag: "(2100,0140)",
    vr: "AE",
    vm: "1",
    name: "DestinationAE"
  },
  21000160: {
    tag: "(2100,0160)",
    vr: "SH",
    vm: "1",
    name: "OwnerID"
  },
  21000170: {
    tag: "(2100,0170)",
    vr: "IS",
    vm: "1",
    name: "NumberOfFilms"
  },
  21000500: {
    tag: "(2100,0500)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPrintJobSequencePullStoredPrint"
  },
  21100010: {
    tag: "(2110,0010)",
    vr: "CS",
    vm: "1",
    name: "PrinterStatus"
  },
  21100020: {
    tag: "(2110,0020)",
    vr: "CS",
    vm: "1",
    name: "PrinterStatusInfo"
  },
  21100030: {
    tag: "(2110,0030)",
    vr: "LO",
    vm: "1",
    name: "PrinterName"
  },
  21100099: {
    tag: "(2110,0099)",
    vr: "SH",
    vm: "1",
    name: "PrintQueueID"
  },
  21200010: {
    tag: "(2120,0010)",
    vr: "CS",
    vm: "1",
    name: "QueueStatus"
  },
  21200050: {
    tag: "(2120,0050)",
    vr: "SQ",
    vm: "1",
    name: "PrintJobDescriptionSequence"
  },
  21200070: {
    tag: "(2120,0070)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPrintJobSequence"
  },
  21300010: {
    tag: "(2130,0010)",
    vr: "SQ",
    vm: "1",
    name: "PrintManagementCapabilitiesSequence"
  },
  21300015: {
    tag: "(2130,0015)",
    vr: "SQ",
    vm: "1",
    name: "PrinterCharacteristicsSequence"
  },
  21300030: {
    tag: "(2130,0030)",
    vr: "SQ",
    vm: "1",
    name: "FilmBoxContentSequence"
  },
  21300040: {
    tag: "(2130,0040)",
    vr: "SQ",
    vm: "1",
    name: "ImageBoxContentSequence"
  },
  21300050: {
    tag: "(2130,0050)",
    vr: "SQ",
    vm: "1",
    name: "AnnotationContentSequence"
  },
  21300060: {
    tag: "(2130,0060)",
    vr: "SQ",
    vm: "1",
    name: "ImageOverlayBoxContentSequence"
  },
  21300080: {
    tag: "(2130,0080)",
    vr: "SQ",
    vm: "1",
    name: "PresentationLUTContentSequence"
  },
  "213000A0": {
    tag: "(2130,00A0)",
    vr: "SQ",
    vm: "1",
    name: "ProposedStudySequence"
  },
  "213000C0": {
    tag: "(2130,00C0)",
    vr: "SQ",
    vm: "1",
    name: "OriginalImageSequence"
  },
  22000001: {
    tag: "(2200,0001)",
    vr: "CS",
    vm: "1",
    name: "LabelUsingInformationExtractedFromInstances"
  },
  22000002: {
    tag: "(2200,0002)",
    vr: "UT",
    vm: "1",
    name: "LabelText"
  },
  22000003: {
    tag: "(2200,0003)",
    vr: "CS",
    vm: "1",
    name: "LabelStyleSelection"
  },
  22000004: {
    tag: "(2200,0004)",
    vr: "LT",
    vm: "1",
    name: "MediaDisposition"
  },
  22000005: {
    tag: "(2200,0005)",
    vr: "LT",
    vm: "1",
    name: "BarcodeValue"
  },
  22000006: {
    tag: "(2200,0006)",
    vr: "CS",
    vm: "1",
    name: "BarcodeSymbology"
  },
  22000007: {
    tag: "(2200,0007)",
    vr: "CS",
    vm: "1",
    name: "AllowMediaSplitting"
  },
  22000008: {
    tag: "(2200,0008)",
    vr: "CS",
    vm: "1",
    name: "IncludeNonDICOMObjects"
  },
  22000009: {
    tag: "(2200,0009)",
    vr: "CS",
    vm: "1",
    name: "IncludeDisplayApplication"
  },
  "2200000A": {
    tag: "(2200,000A)",
    vr: "CS",
    vm: "1",
    name: "PreserveCompositeInstancesAfterMediaCreation"
  },
  "2200000B": {
    tag: "(2200,000B)",
    vr: "US",
    vm: "1",
    name: "TotalNumberOfPiecesOfMediaCreated"
  },
  "2200000C": {
    tag: "(2200,000C)",
    vr: "LO",
    vm: "1",
    name: "RequestedMediaApplicationProfile"
  },
  "2200000D": {
    tag: "(2200,000D)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedStorageMediaSequence"
  },
  "2200000E": {
    tag: "(2200,000E)",
    vr: "AT",
    vm: "1-n",
    name: "FailureAttributes"
  },
  "2200000F": {
    tag: "(2200,000F)",
    vr: "CS",
    vm: "1",
    name: "AllowLossyCompression"
  },
  22000020: {
    tag: "(2200,0020)",
    vr: "CS",
    vm: "1",
    name: "RequestPriority"
  },
  30020002: {
    tag: "(3002,0002)",
    vr: "SH",
    vm: "1",
    name: "RTImageLabel"
  },
  30020003: {
    tag: "(3002,0003)",
    vr: "LO",
    vm: "1",
    name: "RTImageName"
  },
  30020004: {
    tag: "(3002,0004)",
    vr: "ST",
    vm: "1",
    name: "RTImageDescription"
  },
  "3002000A": {
    tag: "(3002,000A)",
    vr: "CS",
    vm: "1",
    name: "ReportedValuesOrigin"
  },
  "3002000C": {
    tag: "(3002,000C)",
    vr: "CS",
    vm: "1",
    name: "RTImagePlane"
  },
  "3002000D": {
    tag: "(3002,000D)",
    vr: "DS",
    vm: "3",
    name: "XRayImageReceptorTranslation"
  },
  "3002000E": {
    tag: "(3002,000E)",
    vr: "DS",
    vm: "1",
    name: "XRayImageReceptorAngle"
  },
  30020010: {
    tag: "(3002,0010)",
    vr: "DS",
    vm: "6",
    name: "RTImageOrientation"
  },
  30020011: {
    tag: "(3002,0011)",
    vr: "DS",
    vm: "2",
    name: "ImagePlanePixelSpacing"
  },
  30020012: {
    tag: "(3002,0012)",
    vr: "DS",
    vm: "2",
    name: "RTImagePosition"
  },
  30020020: {
    tag: "(3002,0020)",
    vr: "SH",
    vm: "1",
    name: "RadiationMachineName"
  },
  30020022: {
    tag: "(3002,0022)",
    vr: "DS",
    vm: "1",
    name: "RadiationMachineSAD"
  },
  30020024: {
    tag: "(3002,0024)",
    vr: "DS",
    vm: "1",
    name: "RadiationMachineSSD"
  },
  30020026: {
    tag: "(3002,0026)",
    vr: "DS",
    vm: "1",
    name: "RTImageSID"
  },
  30020028: {
    tag: "(3002,0028)",
    vr: "DS",
    vm: "1",
    name: "SourceToReferenceObjectDistance"
  },
  30020029: {
    tag: "(3002,0029)",
    vr: "IS",
    vm: "1",
    name: "FractionNumber"
  },
  30020030: {
    tag: "(3002,0030)",
    vr: "SQ",
    vm: "1",
    name: "ExposureSequence"
  },
  30020032: {
    tag: "(3002,0032)",
    vr: "DS",
    vm: "1",
    name: "MetersetExposure"
  },
  30020034: {
    tag: "(3002,0034)",
    vr: "DS",
    vm: "4",
    name: "DiaphragmPosition"
  },
  30020040: {
    tag: "(3002,0040)",
    vr: "SQ",
    vm: "1",
    name: "FluenceMapSequence"
  },
  30020041: {
    tag: "(3002,0041)",
    vr: "CS",
    vm: "1",
    name: "FluenceDataSource"
  },
  30020042: {
    tag: "(3002,0042)",
    vr: "DS",
    vm: "1",
    name: "FluenceDataScale"
  },
  30020050: {
    tag: "(3002,0050)",
    vr: "SQ",
    vm: "1",
    name: "PrimaryFluenceModeSequence"
  },
  30020051: {
    tag: "(3002,0051)",
    vr: "CS",
    vm: "1",
    name: "FluenceMode"
  },
  30020052: {
    tag: "(3002,0052)",
    vr: "SH",
    vm: "1",
    name: "FluenceModeID"
  },
  30040001: {
    tag: "(3004,0001)",
    vr: "CS",
    vm: "1",
    name: "DVHType"
  },
  30040002: {
    tag: "(3004,0002)",
    vr: "CS",
    vm: "1",
    name: "DoseUnits"
  },
  30040004: {
    tag: "(3004,0004)",
    vr: "CS",
    vm: "1",
    name: "DoseType"
  },
  30040005: {
    tag: "(3004,0005)",
    vr: "CS",
    vm: "1",
    name: "SpatialTransformOfDose"
  },
  30040006: {
    tag: "(3004,0006)",
    vr: "LO",
    vm: "1",
    name: "DoseComment"
  },
  30040008: {
    tag: "(3004,0008)",
    vr: "DS",
    vm: "3",
    name: "NormalizationPoint"
  },
  "3004000A": {
    tag: "(3004,000A)",
    vr: "CS",
    vm: "1",
    name: "DoseSummationType"
  },
  "3004000C": {
    tag: "(3004,000C)",
    vr: "DS",
    vm: "2-n",
    name: "GridFrameOffsetVector"
  },
  "3004000E": {
    tag: "(3004,000E)",
    vr: "DS",
    vm: "1",
    name: "DoseGridScaling"
  },
  30040010: {
    tag: "(3004,0010)",
    vr: "SQ",
    vm: "1",
    name: "RTDoseROISequence"
  },
  30040012: {
    tag: "(3004,0012)",
    vr: "DS",
    vm: "1",
    name: "DoseValue"
  },
  30040014: {
    tag: "(3004,0014)",
    vr: "CS",
    vm: "1-3",
    name: "TissueHeterogeneityCorrection"
  },
  30040040: {
    tag: "(3004,0040)",
    vr: "DS",
    vm: "3",
    name: "DVHNormalizationPoint"
  },
  30040042: {
    tag: "(3004,0042)",
    vr: "DS",
    vm: "1",
    name: "DVHNormalizationDoseValue"
  },
  30040050: {
    tag: "(3004,0050)",
    vr: "SQ",
    vm: "1",
    name: "DVHSequence"
  },
  30040052: {
    tag: "(3004,0052)",
    vr: "DS",
    vm: "1",
    name: "DVHDoseScaling"
  },
  30040054: {
    tag: "(3004,0054)",
    vr: "CS",
    vm: "1",
    name: "DVHVolumeUnits"
  },
  30040056: {
    tag: "(3004,0056)",
    vr: "IS",
    vm: "1",
    name: "DVHNumberOfBins"
  },
  30040058: {
    tag: "(3004,0058)",
    vr: "DS",
    vm: "2-2n",
    name: "DVHData"
  },
  30040060: {
    tag: "(3004,0060)",
    vr: "SQ",
    vm: "1",
    name: "DVHReferencedROISequence"
  },
  30040062: {
    tag: "(3004,0062)",
    vr: "CS",
    vm: "1",
    name: "DVHROIContributionType"
  },
  30040070: {
    tag: "(3004,0070)",
    vr: "DS",
    vm: "1",
    name: "DVHMinimumDose"
  },
  30040072: {
    tag: "(3004,0072)",
    vr: "DS",
    vm: "1",
    name: "DVHMaximumDose"
  },
  30040074: {
    tag: "(3004,0074)",
    vr: "DS",
    vm: "1",
    name: "DVHMeanDose"
  },
  30060002: {
    tag: "(3006,0002)",
    vr: "SH",
    vm: "1",
    name: "StructureSetLabel"
  },
  30060004: {
    tag: "(3006,0004)",
    vr: "LO",
    vm: "1",
    name: "StructureSetName"
  },
  30060006: {
    tag: "(3006,0006)",
    vr: "ST",
    vm: "1",
    name: "StructureSetDescription"
  },
  30060008: {
    tag: "(3006,0008)",
    vr: "DA",
    vm: "1",
    name: "StructureSetDate"
  },
  30060009: {
    tag: "(3006,0009)",
    vr: "TM",
    vm: "1",
    name: "StructureSetTime"
  },
  30060010: {
    tag: "(3006,0010)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedFrameOfReferenceSequence"
  },
  30060012: {
    tag: "(3006,0012)",
    vr: "SQ",
    vm: "1",
    name: "RTReferencedStudySequence"
  },
  30060014: {
    tag: "(3006,0014)",
    vr: "SQ",
    vm: "1",
    name: "RTReferencedSeriesSequence"
  },
  30060016: {
    tag: "(3006,0016)",
    vr: "SQ",
    vm: "1",
    name: "ContourImageSequence"
  },
  30060018: {
    tag: "(3006,0018)",
    vr: "SQ",
    vm: "1",
    name: "PredecessorStructureSetSequence"
  },
  30060020: {
    tag: "(3006,0020)",
    vr: "SQ",
    vm: "1",
    name: "StructureSetROISequence"
  },
  30060022: {
    tag: "(3006,0022)",
    vr: "IS",
    vm: "1",
    name: "ROINumber"
  },
  30060024: {
    tag: "(3006,0024)",
    vr: "UI",
    vm: "1",
    name: "ReferencedFrameOfReferenceUID"
  },
  30060026: {
    tag: "(3006,0026)",
    vr: "LO",
    vm: "1",
    name: "ROIName"
  },
  30060028: {
    tag: "(3006,0028)",
    vr: "ST",
    vm: "1",
    name: "ROIDescription"
  },
  "3006002A": {
    tag: "(3006,002A)",
    vr: "IS",
    vm: "3",
    name: "ROIDisplayColor"
  },
  "3006002C": {
    tag: "(3006,002C)",
    vr: "DS",
    vm: "1",
    name: "ROIVolume"
  },
  30060030: {
    tag: "(3006,0030)",
    vr: "SQ",
    vm: "1",
    name: "RTRelatedROISequence"
  },
  30060033: {
    tag: "(3006,0033)",
    vr: "CS",
    vm: "1",
    name: "RTROIRelationship"
  },
  30060036: {
    tag: "(3006,0036)",
    vr: "CS",
    vm: "1",
    name: "ROIGenerationAlgorithm"
  },
  30060038: {
    tag: "(3006,0038)",
    vr: "LO",
    vm: "1",
    name: "ROIGenerationDescription"
  },
  30060039: {
    tag: "(3006,0039)",
    vr: "SQ",
    vm: "1",
    name: "ROIContourSequence"
  },
  30060040: {
    tag: "(3006,0040)",
    vr: "SQ",
    vm: "1",
    name: "ContourSequence"
  },
  30060042: {
    tag: "(3006,0042)",
    vr: "CS",
    vm: "1",
    name: "ContourGeometricType"
  },
  30060044: {
    tag: "(3006,0044)",
    vr: "DS",
    vm: "1",
    name: "ContourSlabThickness"
  },
  30060045: {
    tag: "(3006,0045)",
    vr: "DS",
    vm: "3",
    name: "ContourOffsetVector"
  },
  30060046: {
    tag: "(3006,0046)",
    vr: "IS",
    vm: "1",
    name: "NumberOfContourPoints"
  },
  30060048: {
    tag: "(3006,0048)",
    vr: "IS",
    vm: "1",
    name: "ContourNumber"
  },
  30060049: {
    tag: "(3006,0049)",
    vr: "IS",
    vm: "1-n",
    name: "AttachedContours"
  },
  30060050: {
    tag: "(3006,0050)",
    vr: "DS",
    vm: "3-3n",
    name: "ContourData"
  },
  30060080: {
    tag: "(3006,0080)",
    vr: "SQ",
    vm: "1",
    name: "RTROIObservationsSequence"
  },
  30060082: {
    tag: "(3006,0082)",
    vr: "IS",
    vm: "1",
    name: "ObservationNumber"
  },
  30060084: {
    tag: "(3006,0084)",
    vr: "IS",
    vm: "1",
    name: "ReferencedROINumber"
  },
  30060085: {
    tag: "(3006,0085)",
    vr: "SH",
    vm: "1",
    name: "ROIObservationLabel"
  },
  30060086: {
    tag: "(3006,0086)",
    vr: "SQ",
    vm: "1",
    name: "RTROIIdentificationCodeSequence"
  },
  30060088: {
    tag: "(3006,0088)",
    vr: "ST",
    vm: "1",
    name: "ROIObservationDescription"
  },
  "300600A0": {
    tag: "(3006,00A0)",
    vr: "SQ",
    vm: "1",
    name: "RelatedRTROIObservationsSequence"
  },
  "300600A4": {
    tag: "(3006,00A4)",
    vr: "CS",
    vm: "1",
    name: "RTROIInterpretedType"
  },
  "300600A6": {
    tag: "(3006,00A6)",
    vr: "PN",
    vm: "1",
    name: "ROIInterpreter"
  },
  "300600B0": {
    tag: "(3006,00B0)",
    vr: "SQ",
    vm: "1",
    name: "ROIPhysicalPropertiesSequence"
  },
  "300600B2": {
    tag: "(3006,00B2)",
    vr: "CS",
    vm: "1",
    name: "ROIPhysicalProperty"
  },
  "300600B4": {
    tag: "(3006,00B4)",
    vr: "DS",
    vm: "1",
    name: "ROIPhysicalPropertyValue"
  },
  "300600B6": {
    tag: "(3006,00B6)",
    vr: "SQ",
    vm: "1",
    name: "ROIElementalCompositionSequence"
  },
  "300600B7": {
    tag: "(3006,00B7)",
    vr: "US",
    vm: "1",
    name: "ROIElementalCompositionAtomicNumber"
  },
  "300600B8": {
    tag: "(3006,00B8)",
    vr: "FL",
    vm: "1",
    name: "ROIElementalCompositionAtomicMassFraction"
  },
  "300600B9": {
    tag: "(3006,00B9)",
    vr: "SQ",
    vm: "1",
    name: "AdditionalRTROIIdentificationCodeSequence"
  },
  "300600C0": {
    tag: "(3006,00C0)",
    vr: "SQ",
    vm: "1",
    name: "FrameOfReferenceRelationshipSequence"
  },
  "300600C2": {
    tag: "(3006,00C2)",
    vr: "UI",
    vm: "1",
    name: "RelatedFrameOfReferenceUID"
  },
  "300600C4": {
    tag: "(3006,00C4)",
    vr: "CS",
    vm: "1",
    name: "FrameOfReferenceTransformationType"
  },
  "300600C6": {
    tag: "(3006,00C6)",
    vr: "DS",
    vm: "16",
    name: "FrameOfReferenceTransformationMatrix"
  },
  "300600C8": {
    tag: "(3006,00C8)",
    vr: "LO",
    vm: "1",
    name: "FrameOfReferenceTransformationComment"
  },
  30080010: {
    tag: "(3008,0010)",
    vr: "SQ",
    vm: "1",
    name: "MeasuredDoseReferenceSequence"
  },
  30080012: {
    tag: "(3008,0012)",
    vr: "ST",
    vm: "1",
    name: "MeasuredDoseDescription"
  },
  30080014: {
    tag: "(3008,0014)",
    vr: "CS",
    vm: "1",
    name: "MeasuredDoseType"
  },
  30080016: {
    tag: "(3008,0016)",
    vr: "DS",
    vm: "1",
    name: "MeasuredDoseValue"
  },
  30080020: {
    tag: "(3008,0020)",
    vr: "SQ",
    vm: "1",
    name: "TreatmentSessionBeamSequence"
  },
  30080021: {
    tag: "(3008,0021)",
    vr: "SQ",
    vm: "1",
    name: "TreatmentSessionIonBeamSequence"
  },
  30080022: {
    tag: "(3008,0022)",
    vr: "IS",
    vm: "1",
    name: "CurrentFractionNumber"
  },
  30080024: {
    tag: "(3008,0024)",
    vr: "DA",
    vm: "1",
    name: "TreatmentControlPointDate"
  },
  30080025: {
    tag: "(3008,0025)",
    vr: "TM",
    vm: "1",
    name: "TreatmentControlPointTime"
  },
  "3008002A": {
    tag: "(3008,002A)",
    vr: "CS",
    vm: "1",
    name: "TreatmentTerminationStatus"
  },
  "3008002B": {
    tag: "(3008,002B)",
    vr: "SH",
    vm: "1",
    name: "TreatmentTerminationCode"
  },
  "3008002C": {
    tag: "(3008,002C)",
    vr: "CS",
    vm: "1",
    name: "TreatmentVerificationStatus"
  },
  30080030: {
    tag: "(3008,0030)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedTreatmentRecordSequence"
  },
  30080032: {
    tag: "(3008,0032)",
    vr: "DS",
    vm: "1",
    name: "SpecifiedPrimaryMeterset"
  },
  30080033: {
    tag: "(3008,0033)",
    vr: "DS",
    vm: "1",
    name: "SpecifiedSecondaryMeterset"
  },
  30080036: {
    tag: "(3008,0036)",
    vr: "DS",
    vm: "1",
    name: "DeliveredPrimaryMeterset"
  },
  30080037: {
    tag: "(3008,0037)",
    vr: "DS",
    vm: "1",
    name: "DeliveredSecondaryMeterset"
  },
  "3008003A": {
    tag: "(3008,003A)",
    vr: "DS",
    vm: "1",
    name: "SpecifiedTreatmentTime"
  },
  "3008003B": {
    tag: "(3008,003B)",
    vr: "DS",
    vm: "1",
    name: "DeliveredTreatmentTime"
  },
  30080040: {
    tag: "(3008,0040)",
    vr: "SQ",
    vm: "1",
    name: "ControlPointDeliverySequence"
  },
  30080041: {
    tag: "(3008,0041)",
    vr: "SQ",
    vm: "1",
    name: "IonControlPointDeliverySequence"
  },
  30080042: {
    tag: "(3008,0042)",
    vr: "DS",
    vm: "1",
    name: "SpecifiedMeterset"
  },
  30080044: {
    tag: "(3008,0044)",
    vr: "DS",
    vm: "1",
    name: "DeliveredMeterset"
  },
  30080045: {
    tag: "(3008,0045)",
    vr: "FL",
    vm: "1",
    name: "MetersetRateSet"
  },
  30080046: {
    tag: "(3008,0046)",
    vr: "FL",
    vm: "1",
    name: "MetersetRateDelivered"
  },
  30080047: {
    tag: "(3008,0047)",
    vr: "FL",
    vm: "1-n",
    name: "ScanSpotMetersetsDelivered"
  },
  30080048: {
    tag: "(3008,0048)",
    vr: "DS",
    vm: "1",
    name: "DoseRateDelivered"
  },
  30080050: {
    tag: "(3008,0050)",
    vr: "SQ",
    vm: "1",
    name: "TreatmentSummaryCalculatedDoseReferenceSequence"
  },
  30080052: {
    tag: "(3008,0052)",
    vr: "DS",
    vm: "1",
    name: "CumulativeDoseToDoseReference"
  },
  30080054: {
    tag: "(3008,0054)",
    vr: "DA",
    vm: "1",
    name: "FirstTreatmentDate"
  },
  30080056: {
    tag: "(3008,0056)",
    vr: "DA",
    vm: "1",
    name: "MostRecentTreatmentDate"
  },
  "3008005A": {
    tag: "(3008,005A)",
    vr: "IS",
    vm: "1",
    name: "NumberOfFractionsDelivered"
  },
  30080060: {
    tag: "(3008,0060)",
    vr: "SQ",
    vm: "1",
    name: "OverrideSequence"
  },
  30080061: {
    tag: "(3008,0061)",
    vr: "AT",
    vm: "1",
    name: "ParameterSequencePointer"
  },
  30080062: {
    tag: "(3008,0062)",
    vr: "AT",
    vm: "1",
    name: "OverrideParameterPointer"
  },
  30080063: {
    tag: "(3008,0063)",
    vr: "IS",
    vm: "1",
    name: "ParameterItemIndex"
  },
  30080064: {
    tag: "(3008,0064)",
    vr: "IS",
    vm: "1",
    name: "MeasuredDoseReferenceNumber"
  },
  30080065: {
    tag: "(3008,0065)",
    vr: "AT",
    vm: "1",
    name: "ParameterPointer"
  },
  30080066: {
    tag: "(3008,0066)",
    vr: "ST",
    vm: "1",
    name: "OverrideReason"
  },
  30080067: {
    tag: "(3008,0067)",
    vr: "US",
    vm: "1",
    name: "ParameterValueNumber"
  },
  30080068: {
    tag: "(3008,0068)",
    vr: "SQ",
    vm: "1",
    name: "CorrectedParameterSequence"
  },
  "3008006A": {
    tag: "(3008,006A)",
    vr: "FL",
    vm: "1",
    name: "CorrectionValue"
  },
  30080070: {
    tag: "(3008,0070)",
    vr: "SQ",
    vm: "1",
    name: "CalculatedDoseReferenceSequence"
  },
  30080072: {
    tag: "(3008,0072)",
    vr: "IS",
    vm: "1",
    name: "CalculatedDoseReferenceNumber"
  },
  30080074: {
    tag: "(3008,0074)",
    vr: "ST",
    vm: "1",
    name: "CalculatedDoseReferenceDescription"
  },
  30080076: {
    tag: "(3008,0076)",
    vr: "DS",
    vm: "1",
    name: "CalculatedDoseReferenceDoseValue"
  },
  30080078: {
    tag: "(3008,0078)",
    vr: "DS",
    vm: "1",
    name: "StartMeterset"
  },
  "3008007A": {
    tag: "(3008,007A)",
    vr: "DS",
    vm: "1",
    name: "EndMeterset"
  },
  30080080: {
    tag: "(3008,0080)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedMeasuredDoseReferenceSequence"
  },
  30080082: {
    tag: "(3008,0082)",
    vr: "IS",
    vm: "1",
    name: "ReferencedMeasuredDoseReferenceNumber"
  },
  30080090: {
    tag: "(3008,0090)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedCalculatedDoseReferenceSequence"
  },
  30080092: {
    tag: "(3008,0092)",
    vr: "IS",
    vm: "1",
    name: "ReferencedCalculatedDoseReferenceNumber"
  },
  "300800A0": {
    tag: "(3008,00A0)",
    vr: "SQ",
    vm: "1",
    name: "BeamLimitingDeviceLeafPairsSequence"
  },
  "300800B0": {
    tag: "(3008,00B0)",
    vr: "SQ",
    vm: "1",
    name: "RecordedWedgeSequence"
  },
  "300800C0": {
    tag: "(3008,00C0)",
    vr: "SQ",
    vm: "1",
    name: "RecordedCompensatorSequence"
  },
  "300800D0": {
    tag: "(3008,00D0)",
    vr: "SQ",
    vm: "1",
    name: "RecordedBlockSequence"
  },
  "300800E0": {
    tag: "(3008,00E0)",
    vr: "SQ",
    vm: "1",
    name: "TreatmentSummaryMeasuredDoseReferenceSequence"
  },
  "300800F0": {
    tag: "(3008,00F0)",
    vr: "SQ",
    vm: "1",
    name: "RecordedSnoutSequence"
  },
  "300800F2": {
    tag: "(3008,00F2)",
    vr: "SQ",
    vm: "1",
    name: "RecordedRangeShifterSequence"
  },
  "300800F4": {
    tag: "(3008,00F4)",
    vr: "SQ",
    vm: "1",
    name: "RecordedLateralSpreadingDeviceSequence"
  },
  "300800F6": {
    tag: "(3008,00F6)",
    vr: "SQ",
    vm: "1",
    name: "RecordedRangeModulatorSequence"
  },
  30080100: {
    tag: "(3008,0100)",
    vr: "SQ",
    vm: "1",
    name: "RecordedSourceSequence"
  },
  30080105: {
    tag: "(3008,0105)",
    vr: "LO",
    vm: "1",
    name: "SourceSerialNumber"
  },
  30080110: {
    tag: "(3008,0110)",
    vr: "SQ",
    vm: "1",
    name: "TreatmentSessionApplicationSetupSequence"
  },
  30080116: {
    tag: "(3008,0116)",
    vr: "CS",
    vm: "1",
    name: "ApplicationSetupCheck"
  },
  30080120: {
    tag: "(3008,0120)",
    vr: "SQ",
    vm: "1",
    name: "RecordedBrachyAccessoryDeviceSequence"
  },
  30080122: {
    tag: "(3008,0122)",
    vr: "IS",
    vm: "1",
    name: "ReferencedBrachyAccessoryDeviceNumber"
  },
  30080130: {
    tag: "(3008,0130)",
    vr: "SQ",
    vm: "1",
    name: "RecordedChannelSequence"
  },
  30080132: {
    tag: "(3008,0132)",
    vr: "DS",
    vm: "1",
    name: "SpecifiedChannelTotalTime"
  },
  30080134: {
    tag: "(3008,0134)",
    vr: "DS",
    vm: "1",
    name: "DeliveredChannelTotalTime"
  },
  30080136: {
    tag: "(3008,0136)",
    vr: "IS",
    vm: "1",
    name: "SpecifiedNumberOfPulses"
  },
  30080138: {
    tag: "(3008,0138)",
    vr: "IS",
    vm: "1",
    name: "DeliveredNumberOfPulses"
  },
  "3008013A": {
    tag: "(3008,013A)",
    vr: "DS",
    vm: "1",
    name: "SpecifiedPulseRepetitionInterval"
  },
  "3008013C": {
    tag: "(3008,013C)",
    vr: "DS",
    vm: "1",
    name: "DeliveredPulseRepetitionInterval"
  },
  30080140: {
    tag: "(3008,0140)",
    vr: "SQ",
    vm: "1",
    name: "RecordedSourceApplicatorSequence"
  },
  30080142: {
    tag: "(3008,0142)",
    vr: "IS",
    vm: "1",
    name: "ReferencedSourceApplicatorNumber"
  },
  30080150: {
    tag: "(3008,0150)",
    vr: "SQ",
    vm: "1",
    name: "RecordedChannelShieldSequence"
  },
  30080152: {
    tag: "(3008,0152)",
    vr: "IS",
    vm: "1",
    name: "ReferencedChannelShieldNumber"
  },
  30080160: {
    tag: "(3008,0160)",
    vr: "SQ",
    vm: "1",
    name: "BrachyControlPointDeliveredSequence"
  },
  30080162: {
    tag: "(3008,0162)",
    vr: "DA",
    vm: "1",
    name: "SafePositionExitDate"
  },
  30080164: {
    tag: "(3008,0164)",
    vr: "TM",
    vm: "1",
    name: "SafePositionExitTime"
  },
  30080166: {
    tag: "(3008,0166)",
    vr: "DA",
    vm: "1",
    name: "SafePositionReturnDate"
  },
  30080168: {
    tag: "(3008,0168)",
    vr: "TM",
    vm: "1",
    name: "SafePositionReturnTime"
  },
  30080171: {
    tag: "(3008,0171)",
    vr: "SQ",
    vm: "1",
    name: "PulseSpecificBrachyControlPointDeliveredSequence"
  },
  30080172: {
    tag: "(3008,0172)",
    vr: "US",
    vm: "1",
    name: "PulseNumber"
  },
  30080173: {
    tag: "(3008,0173)",
    vr: "SQ",
    vm: "1",
    name: "BrachyPulseControlPointDeliveredSequence"
  },
  30080200: {
    tag: "(3008,0200)",
    vr: "CS",
    vm: "1",
    name: "CurrentTreatmentStatus"
  },
  30080202: {
    tag: "(3008,0202)",
    vr: "ST",
    vm: "1",
    name: "TreatmentStatusComment"
  },
  30080220: {
    tag: "(3008,0220)",
    vr: "SQ",
    vm: "1",
    name: "FractionGroupSummarySequence"
  },
  30080223: {
    tag: "(3008,0223)",
    vr: "IS",
    vm: "1",
    name: "ReferencedFractionNumber"
  },
  30080224: {
    tag: "(3008,0224)",
    vr: "CS",
    vm: "1",
    name: "FractionGroupType"
  },
  30080230: {
    tag: "(3008,0230)",
    vr: "CS",
    vm: "1",
    name: "BeamStopperPosition"
  },
  30080240: {
    tag: "(3008,0240)",
    vr: "SQ",
    vm: "1",
    name: "FractionStatusSummarySequence"
  },
  30080250: {
    tag: "(3008,0250)",
    vr: "DA",
    vm: "1",
    name: "TreatmentDate"
  },
  30080251: {
    tag: "(3008,0251)",
    vr: "TM",
    vm: "1",
    name: "TreatmentTime"
  },
  "300A0002": {
    tag: "(300A,0002)",
    vr: "SH",
    vm: "1",
    name: "RTPlanLabel"
  },
  "300A0003": {
    tag: "(300A,0003)",
    vr: "LO",
    vm: "1",
    name: "RTPlanName"
  },
  "300A0004": {
    tag: "(300A,0004)",
    vr: "ST",
    vm: "1",
    name: "RTPlanDescription"
  },
  "300A0006": {
    tag: "(300A,0006)",
    vr: "DA",
    vm: "1",
    name: "RTPlanDate"
  },
  "300A0007": {
    tag: "(300A,0007)",
    vr: "TM",
    vm: "1",
    name: "RTPlanTime"
  },
  "300A0009": {
    tag: "(300A,0009)",
    vr: "LO",
    vm: "1-n",
    name: "TreatmentProtocols"
  },
  "300A000A": {
    tag: "(300A,000A)",
    vr: "CS",
    vm: "1",
    name: "PlanIntent"
  },
  "300A000B": {
    tag: "(300A,000B)",
    vr: "LO",
    vm: "1-n",
    name: "TreatmentSites"
  },
  "300A000C": {
    tag: "(300A,000C)",
    vr: "CS",
    vm: "1",
    name: "RTPlanGeometry"
  },
  "300A000E": {
    tag: "(300A,000E)",
    vr: "ST",
    vm: "1",
    name: "PrescriptionDescription"
  },
  "300A0010": {
    tag: "(300A,0010)",
    vr: "SQ",
    vm: "1",
    name: "DoseReferenceSequence"
  },
  "300A0012": {
    tag: "(300A,0012)",
    vr: "IS",
    vm: "1",
    name: "DoseReferenceNumber"
  },
  "300A0013": {
    tag: "(300A,0013)",
    vr: "UI",
    vm: "1",
    name: "DoseReferenceUID"
  },
  "300A0014": {
    tag: "(300A,0014)",
    vr: "CS",
    vm: "1",
    name: "DoseReferenceStructureType"
  },
  "300A0015": {
    tag: "(300A,0015)",
    vr: "CS",
    vm: "1",
    name: "NominalBeamEnergyUnit"
  },
  "300A0016": {
    tag: "(300A,0016)",
    vr: "LO",
    vm: "1",
    name: "DoseReferenceDescription"
  },
  "300A0018": {
    tag: "(300A,0018)",
    vr: "DS",
    vm: "3",
    name: "DoseReferencePointCoordinates"
  },
  "300A001A": {
    tag: "(300A,001A)",
    vr: "DS",
    vm: "1",
    name: "NominalPriorDose"
  },
  "300A0020": {
    tag: "(300A,0020)",
    vr: "CS",
    vm: "1",
    name: "DoseReferenceType"
  },
  "300A0021": {
    tag: "(300A,0021)",
    vr: "DS",
    vm: "1",
    name: "ConstraintWeight"
  },
  "300A0022": {
    tag: "(300A,0022)",
    vr: "DS",
    vm: "1",
    name: "DeliveryWarningDose"
  },
  "300A0023": {
    tag: "(300A,0023)",
    vr: "DS",
    vm: "1",
    name: "DeliveryMaximumDose"
  },
  "300A0025": {
    tag: "(300A,0025)",
    vr: "DS",
    vm: "1",
    name: "TargetMinimumDose"
  },
  "300A0026": {
    tag: "(300A,0026)",
    vr: "DS",
    vm: "1",
    name: "TargetPrescriptionDose"
  },
  "300A0027": {
    tag: "(300A,0027)",
    vr: "DS",
    vm: "1",
    name: "TargetMaximumDose"
  },
  "300A0028": {
    tag: "(300A,0028)",
    vr: "DS",
    vm: "1",
    name: "TargetUnderdoseVolumeFraction"
  },
  "300A002A": {
    tag: "(300A,002A)",
    vr: "DS",
    vm: "1",
    name: "OrganAtRiskFullVolumeDose"
  },
  "300A002B": {
    tag: "(300A,002B)",
    vr: "DS",
    vm: "1",
    name: "OrganAtRiskLimitDose"
  },
  "300A002C": {
    tag: "(300A,002C)",
    vr: "DS",
    vm: "1",
    name: "OrganAtRiskMaximumDose"
  },
  "300A002D": {
    tag: "(300A,002D)",
    vr: "DS",
    vm: "1",
    name: "OrganAtRiskOverdoseVolumeFraction"
  },
  "300A0040": {
    tag: "(300A,0040)",
    vr: "SQ",
    vm: "1",
    name: "ToleranceTableSequence"
  },
  "300A0042": {
    tag: "(300A,0042)",
    vr: "IS",
    vm: "1",
    name: "ToleranceTableNumber"
  },
  "300A0043": {
    tag: "(300A,0043)",
    vr: "SH",
    vm: "1",
    name: "ToleranceTableLabel"
  },
  "300A0044": {
    tag: "(300A,0044)",
    vr: "DS",
    vm: "1",
    name: "GantryAngleTolerance"
  },
  "300A0046": {
    tag: "(300A,0046)",
    vr: "DS",
    vm: "1",
    name: "BeamLimitingDeviceAngleTolerance"
  },
  "300A0048": {
    tag: "(300A,0048)",
    vr: "SQ",
    vm: "1",
    name: "BeamLimitingDeviceToleranceSequence"
  },
  "300A004A": {
    tag: "(300A,004A)",
    vr: "DS",
    vm: "1",
    name: "BeamLimitingDevicePositionTolerance"
  },
  "300A004B": {
    tag: "(300A,004B)",
    vr: "FL",
    vm: "1",
    name: "SnoutPositionTolerance"
  },
  "300A004C": {
    tag: "(300A,004C)",
    vr: "DS",
    vm: "1",
    name: "PatientSupportAngleTolerance"
  },
  "300A004E": {
    tag: "(300A,004E)",
    vr: "DS",
    vm: "1",
    name: "TableTopEccentricAngleTolerance"
  },
  "300A004F": {
    tag: "(300A,004F)",
    vr: "FL",
    vm: "1",
    name: "TableTopPitchAngleTolerance"
  },
  "300A0050": {
    tag: "(300A,0050)",
    vr: "FL",
    vm: "1",
    name: "TableTopRollAngleTolerance"
  },
  "300A0051": {
    tag: "(300A,0051)",
    vr: "DS",
    vm: "1",
    name: "TableTopVerticalPositionTolerance"
  },
  "300A0052": {
    tag: "(300A,0052)",
    vr: "DS",
    vm: "1",
    name: "TableTopLongitudinalPositionTolerance"
  },
  "300A0053": {
    tag: "(300A,0053)",
    vr: "DS",
    vm: "1",
    name: "TableTopLateralPositionTolerance"
  },
  "300A0055": {
    tag: "(300A,0055)",
    vr: "CS",
    vm: "1",
    name: "RTPlanRelationship"
  },
  "300A0070": {
    tag: "(300A,0070)",
    vr: "SQ",
    vm: "1",
    name: "FractionGroupSequence"
  },
  "300A0071": {
    tag: "(300A,0071)",
    vr: "IS",
    vm: "1",
    name: "FractionGroupNumber"
  },
  "300A0072": {
    tag: "(300A,0072)",
    vr: "LO",
    vm: "1",
    name: "FractionGroupDescription"
  },
  "300A0078": {
    tag: "(300A,0078)",
    vr: "IS",
    vm: "1",
    name: "NumberOfFractionsPlanned"
  },
  "300A0079": {
    tag: "(300A,0079)",
    vr: "IS",
    vm: "1",
    name: "NumberOfFractionPatternDigitsPerDay"
  },
  "300A007A": {
    tag: "(300A,007A)",
    vr: "IS",
    vm: "1",
    name: "RepeatFractionCycleLength"
  },
  "300A007B": {
    tag: "(300A,007B)",
    vr: "LT",
    vm: "1",
    name: "FractionPattern"
  },
  "300A0080": {
    tag: "(300A,0080)",
    vr: "IS",
    vm: "1",
    name: "NumberOfBeams"
  },
  "300A0082": {
    tag: "(300A,0082)",
    vr: "DS",
    vm: "3",
    name: "BeamDoseSpecificationPoint"
  },
  "300A0083": {
    tag: "(300A,0083)",
    vr: "UI",
    vm: "1",
    name: "ReferencedDoseReferenceUID"
  },
  "300A0084": {
    tag: "(300A,0084)",
    vr: "DS",
    vm: "1",
    name: "BeamDose"
  },
  "300A0086": {
    tag: "(300A,0086)",
    vr: "DS",
    vm: "1",
    name: "BeamMeterset"
  },
  "300A0088": {
    tag: "(300A,0088)",
    vr: "FL",
    vm: "1",
    name: "BeamDosePointDepth"
  },
  "300A0089": {
    tag: "(300A,0089)",
    vr: "FL",
    vm: "1",
    name: "BeamDosePointEquivalentDepth"
  },
  "300A008A": {
    tag: "(300A,008A)",
    vr: "FL",
    vm: "1",
    name: "BeamDosePointSSD"
  },
  "300A008B": {
    tag: "(300A,008B)",
    vr: "CS",
    vm: "1",
    name: "BeamDoseMeaning"
  },
  "300A008C": {
    tag: "(300A,008C)",
    vr: "SQ",
    vm: "1",
    name: "BeamDoseVerificationControlPointSequence"
  },
  "300A008D": {
    tag: "(300A,008D)",
    vr: "FL",
    vm: "1",
    name: "AverageBeamDosePointDepth"
  },
  "300A008E": {
    tag: "(300A,008E)",
    vr: "FL",
    vm: "1",
    name: "AverageBeamDosePointEquivalentDepth"
  },
  "300A008F": {
    tag: "(300A,008F)",
    vr: "FL",
    vm: "1",
    name: "AverageBeamDosePointSSD"
  },
  "300A0090": {
    tag: "(300A,0090)",
    vr: "CS",
    vm: "1",
    name: "BeamDoseType"
  },
  "300A0091": {
    tag: "(300A,0091)",
    vr: "DS",
    vm: "1",
    name: "AlternateBeamDose"
  },
  "300A0092": {
    tag: "(300A,0092)",
    vr: "CS",
    vm: "1",
    name: "AlternateBeamDoseType"
  },
  "300A0093": {
    tag: "(300A,0093)",
    vr: "CS",
    vm: "1",
    name: "DepthValueAveragingFlag"
  },
  "300A00A0": {
    tag: "(300A,00A0)",
    vr: "IS",
    vm: "1",
    name: "NumberOfBrachyApplicationSetups"
  },
  "300A00A2": {
    tag: "(300A,00A2)",
    vr: "DS",
    vm: "3",
    name: "BrachyApplicationSetupDoseSpecificationPoint"
  },
  "300A00A4": {
    tag: "(300A,00A4)",
    vr: "DS",
    vm: "1",
    name: "BrachyApplicationSetupDose"
  },
  "300A00B0": {
    tag: "(300A,00B0)",
    vr: "SQ",
    vm: "1",
    name: "BeamSequence"
  },
  "300A00B2": {
    tag: "(300A,00B2)",
    vr: "SH",
    vm: "1",
    name: "TreatmentMachineName"
  },
  "300A00B3": {
    tag: "(300A,00B3)",
    vr: "CS",
    vm: "1",
    name: "PrimaryDosimeterUnit"
  },
  "300A00B4": {
    tag: "(300A,00B4)",
    vr: "DS",
    vm: "1",
    name: "SourceAxisDistance"
  },
  "300A00B6": {
    tag: "(300A,00B6)",
    vr: "SQ",
    vm: "1",
    name: "BeamLimitingDeviceSequence"
  },
  "300A00B8": {
    tag: "(300A,00B8)",
    vr: "CS",
    vm: "1",
    name: "RTBeamLimitingDeviceType"
  },
  "300A00BA": {
    tag: "(300A,00BA)",
    vr: "DS",
    vm: "1",
    name: "SourceToBeamLimitingDeviceDistance"
  },
  "300A00BB": {
    tag: "(300A,00BB)",
    vr: "FL",
    vm: "1",
    name: "IsocenterToBeamLimitingDeviceDistance"
  },
  "300A00BC": {
    tag: "(300A,00BC)",
    vr: "IS",
    vm: "1",
    name: "NumberOfLeafJawPairs"
  },
  "300A00BE": {
    tag: "(300A,00BE)",
    vr: "DS",
    vm: "3-n",
    name: "LeafPositionBoundaries"
  },
  "300A00C0": {
    tag: "(300A,00C0)",
    vr: "IS",
    vm: "1",
    name: "BeamNumber"
  },
  "300A00C2": {
    tag: "(300A,00C2)",
    vr: "LO",
    vm: "1",
    name: "BeamName"
  },
  "300A00C3": {
    tag: "(300A,00C3)",
    vr: "ST",
    vm: "1",
    name: "BeamDescription"
  },
  "300A00C4": {
    tag: "(300A,00C4)",
    vr: "CS",
    vm: "1",
    name: "BeamType"
  },
  "300A00C5": {
    tag: "(300A,00C5)",
    vr: "FD",
    vm: "1",
    name: "BeamDeliveryDurationLimit"
  },
  "300A00C6": {
    tag: "(300A,00C6)",
    vr: "CS",
    vm: "1",
    name: "RadiationType"
  },
  "300A00C7": {
    tag: "(300A,00C7)",
    vr: "CS",
    vm: "1",
    name: "HighDoseTechniqueType"
  },
  "300A00C8": {
    tag: "(300A,00C8)",
    vr: "IS",
    vm: "1",
    name: "ReferenceImageNumber"
  },
  "300A00CA": {
    tag: "(300A,00CA)",
    vr: "SQ",
    vm: "1",
    name: "PlannedVerificationImageSequence"
  },
  "300A00CC": {
    tag: "(300A,00CC)",
    vr: "LO",
    vm: "1-n",
    name: "ImagingDeviceSpecificAcquisitionParameters"
  },
  "300A00CE": {
    tag: "(300A,00CE)",
    vr: "CS",
    vm: "1",
    name: "TreatmentDeliveryType"
  },
  "300A00D0": {
    tag: "(300A,00D0)",
    vr: "IS",
    vm: "1",
    name: "NumberOfWedges"
  },
  "300A00D1": {
    tag: "(300A,00D1)",
    vr: "SQ",
    vm: "1",
    name: "WedgeSequence"
  },
  "300A00D2": {
    tag: "(300A,00D2)",
    vr: "IS",
    vm: "1",
    name: "WedgeNumber"
  },
  "300A00D3": {
    tag: "(300A,00D3)",
    vr: "CS",
    vm: "1",
    name: "WedgeType"
  },
  "300A00D4": {
    tag: "(300A,00D4)",
    vr: "SH",
    vm: "1",
    name: "WedgeID"
  },
  "300A00D5": {
    tag: "(300A,00D5)",
    vr: "IS",
    vm: "1",
    name: "WedgeAngle"
  },
  "300A00D6": {
    tag: "(300A,00D6)",
    vr: "DS",
    vm: "1",
    name: "WedgeFactor"
  },
  "300A00D7": {
    tag: "(300A,00D7)",
    vr: "FL",
    vm: "1",
    name: "TotalWedgeTrayWaterEquivalentThickness"
  },
  "300A00D8": {
    tag: "(300A,00D8)",
    vr: "DS",
    vm: "1",
    name: "WedgeOrientation"
  },
  "300A00D9": {
    tag: "(300A,00D9)",
    vr: "FL",
    vm: "1",
    name: "IsocenterToWedgeTrayDistance"
  },
  "300A00DA": {
    tag: "(300A,00DA)",
    vr: "DS",
    vm: "1",
    name: "SourceToWedgeTrayDistance"
  },
  "300A00DB": {
    tag: "(300A,00DB)",
    vr: "FL",
    vm: "1",
    name: "WedgeThinEdgePosition"
  },
  "300A00DC": {
    tag: "(300A,00DC)",
    vr: "SH",
    vm: "1",
    name: "BolusID"
  },
  "300A00DD": {
    tag: "(300A,00DD)",
    vr: "ST",
    vm: "1",
    name: "BolusDescription"
  },
  "300A00DE": {
    tag: "(300A,00DE)",
    vr: "DS",
    vm: "1",
    name: "EffectiveWedgeAngle"
  },
  "300A00E0": {
    tag: "(300A,00E0)",
    vr: "IS",
    vm: "1",
    name: "NumberOfCompensators"
  },
  "300A00E1": {
    tag: "(300A,00E1)",
    vr: "SH",
    vm: "1",
    name: "MaterialID"
  },
  "300A00E2": {
    tag: "(300A,00E2)",
    vr: "DS",
    vm: "1",
    name: "TotalCompensatorTrayFactor"
  },
  "300A00E3": {
    tag: "(300A,00E3)",
    vr: "SQ",
    vm: "1",
    name: "CompensatorSequence"
  },
  "300A00E4": {
    tag: "(300A,00E4)",
    vr: "IS",
    vm: "1",
    name: "CompensatorNumber"
  },
  "300A00E5": {
    tag: "(300A,00E5)",
    vr: "SH",
    vm: "1",
    name: "CompensatorID"
  },
  "300A00E6": {
    tag: "(300A,00E6)",
    vr: "DS",
    vm: "1",
    name: "SourceToCompensatorTrayDistance"
  },
  "300A00E7": {
    tag: "(300A,00E7)",
    vr: "IS",
    vm: "1",
    name: "CompensatorRows"
  },
  "300A00E8": {
    tag: "(300A,00E8)",
    vr: "IS",
    vm: "1",
    name: "CompensatorColumns"
  },
  "300A00E9": {
    tag: "(300A,00E9)",
    vr: "DS",
    vm: "2",
    name: "CompensatorPixelSpacing"
  },
  "300A00EA": {
    tag: "(300A,00EA)",
    vr: "DS",
    vm: "2",
    name: "CompensatorPosition"
  },
  "300A00EB": {
    tag: "(300A,00EB)",
    vr: "DS",
    vm: "1-n",
    name: "CompensatorTransmissionData"
  },
  "300A00EC": {
    tag: "(300A,00EC)",
    vr: "DS",
    vm: "1-n",
    name: "CompensatorThicknessData"
  },
  "300A00ED": {
    tag: "(300A,00ED)",
    vr: "IS",
    vm: "1",
    name: "NumberOfBoli"
  },
  "300A00EE": {
    tag: "(300A,00EE)",
    vr: "CS",
    vm: "1",
    name: "CompensatorType"
  },
  "300A00EF": {
    tag: "(300A,00EF)",
    vr: "SH",
    vm: "1",
    name: "CompensatorTrayID"
  },
  "300A00F0": {
    tag: "(300A,00F0)",
    vr: "IS",
    vm: "1",
    name: "NumberOfBlocks"
  },
  "300A00F2": {
    tag: "(300A,00F2)",
    vr: "DS",
    vm: "1",
    name: "TotalBlockTrayFactor"
  },
  "300A00F3": {
    tag: "(300A,00F3)",
    vr: "FL",
    vm: "1",
    name: "TotalBlockTrayWaterEquivalentThickness"
  },
  "300A00F4": {
    tag: "(300A,00F4)",
    vr: "SQ",
    vm: "1",
    name: "BlockSequence"
  },
  "300A00F5": {
    tag: "(300A,00F5)",
    vr: "SH",
    vm: "1",
    name: "BlockTrayID"
  },
  "300A00F6": {
    tag: "(300A,00F6)",
    vr: "DS",
    vm: "1",
    name: "SourceToBlockTrayDistance"
  },
  "300A00F7": {
    tag: "(300A,00F7)",
    vr: "FL",
    vm: "1",
    name: "IsocenterToBlockTrayDistance"
  },
  "300A00F8": {
    tag: "(300A,00F8)",
    vr: "CS",
    vm: "1",
    name: "BlockType"
  },
  "300A00F9": {
    tag: "(300A,00F9)",
    vr: "LO",
    vm: "1",
    name: "AccessoryCode"
  },
  "300A00FA": {
    tag: "(300A,00FA)",
    vr: "CS",
    vm: "1",
    name: "BlockDivergence"
  },
  "300A00FB": {
    tag: "(300A,00FB)",
    vr: "CS",
    vm: "1",
    name: "BlockMountingPosition"
  },
  "300A00FC": {
    tag: "(300A,00FC)",
    vr: "IS",
    vm: "1",
    name: "BlockNumber"
  },
  "300A00FE": {
    tag: "(300A,00FE)",
    vr: "LO",
    vm: "1",
    name: "BlockName"
  },
  "300A0100": {
    tag: "(300A,0100)",
    vr: "DS",
    vm: "1",
    name: "BlockThickness"
  },
  "300A0102": {
    tag: "(300A,0102)",
    vr: "DS",
    vm: "1",
    name: "BlockTransmission"
  },
  "300A0104": {
    tag: "(300A,0104)",
    vr: "IS",
    vm: "1",
    name: "BlockNumberOfPoints"
  },
  "300A0106": {
    tag: "(300A,0106)",
    vr: "DS",
    vm: "2-2n",
    name: "BlockData"
  },
  "300A0107": {
    tag: "(300A,0107)",
    vr: "SQ",
    vm: "1",
    name: "ApplicatorSequence"
  },
  "300A0108": {
    tag: "(300A,0108)",
    vr: "SH",
    vm: "1",
    name: "ApplicatorID"
  },
  "300A0109": {
    tag: "(300A,0109)",
    vr: "CS",
    vm: "1",
    name: "ApplicatorType"
  },
  "300A010A": {
    tag: "(300A,010A)",
    vr: "LO",
    vm: "1",
    name: "ApplicatorDescription"
  },
  "300A010C": {
    tag: "(300A,010C)",
    vr: "DS",
    vm: "1",
    name: "CumulativeDoseReferenceCoefficient"
  },
  "300A010E": {
    tag: "(300A,010E)",
    vr: "DS",
    vm: "1",
    name: "FinalCumulativeMetersetWeight"
  },
  "300A0110": {
    tag: "(300A,0110)",
    vr: "IS",
    vm: "1",
    name: "NumberOfControlPoints"
  },
  "300A0111": {
    tag: "(300A,0111)",
    vr: "SQ",
    vm: "1",
    name: "ControlPointSequence"
  },
  "300A0112": {
    tag: "(300A,0112)",
    vr: "IS",
    vm: "1",
    name: "ControlPointIndex"
  },
  "300A0114": {
    tag: "(300A,0114)",
    vr: "DS",
    vm: "1",
    name: "NominalBeamEnergy"
  },
  "300A0115": {
    tag: "(300A,0115)",
    vr: "DS",
    vm: "1",
    name: "DoseRateSet"
  },
  "300A0116": {
    tag: "(300A,0116)",
    vr: "SQ",
    vm: "1",
    name: "WedgePositionSequence"
  },
  "300A0118": {
    tag: "(300A,0118)",
    vr: "CS",
    vm: "1",
    name: "WedgePosition"
  },
  "300A011A": {
    tag: "(300A,011A)",
    vr: "SQ",
    vm: "1",
    name: "BeamLimitingDevicePositionSequence"
  },
  "300A011C": {
    tag: "(300A,011C)",
    vr: "DS",
    vm: "2-2n",
    name: "LeafJawPositions"
  },
  "300A011E": {
    tag: "(300A,011E)",
    vr: "DS",
    vm: "1",
    name: "GantryAngle"
  },
  "300A011F": {
    tag: "(300A,011F)",
    vr: "CS",
    vm: "1",
    name: "GantryRotationDirection"
  },
  "300A0120": {
    tag: "(300A,0120)",
    vr: "DS",
    vm: "1",
    name: "BeamLimitingDeviceAngle"
  },
  "300A0121": {
    tag: "(300A,0121)",
    vr: "CS",
    vm: "1",
    name: "BeamLimitingDeviceRotationDirection"
  },
  "300A0122": {
    tag: "(300A,0122)",
    vr: "DS",
    vm: "1",
    name: "PatientSupportAngle"
  },
  "300A0123": {
    tag: "(300A,0123)",
    vr: "CS",
    vm: "1",
    name: "PatientSupportRotationDirection"
  },
  "300A0124": {
    tag: "(300A,0124)",
    vr: "DS",
    vm: "1",
    name: "TableTopEccentricAxisDistance"
  },
  "300A0125": {
    tag: "(300A,0125)",
    vr: "DS",
    vm: "1",
    name: "TableTopEccentricAngle"
  },
  "300A0126": {
    tag: "(300A,0126)",
    vr: "CS",
    vm: "1",
    name: "TableTopEccentricRotationDirection"
  },
  "300A0128": {
    tag: "(300A,0128)",
    vr: "DS",
    vm: "1",
    name: "TableTopVerticalPosition"
  },
  "300A0129": {
    tag: "(300A,0129)",
    vr: "DS",
    vm: "1",
    name: "TableTopLongitudinalPosition"
  },
  "300A012A": {
    tag: "(300A,012A)",
    vr: "DS",
    vm: "1",
    name: "TableTopLateralPosition"
  },
  "300A012C": {
    tag: "(300A,012C)",
    vr: "DS",
    vm: "3",
    name: "IsocenterPosition"
  },
  "300A012E": {
    tag: "(300A,012E)",
    vr: "DS",
    vm: "3",
    name: "SurfaceEntryPoint"
  },
  "300A0130": {
    tag: "(300A,0130)",
    vr: "DS",
    vm: "1",
    name: "SourceToSurfaceDistance"
  },
  "300A0131": {
    tag: "(300A,0131)",
    vr: "FL",
    vm: "1",
    name: "AverageBeamDosePointSourceToExternalContourDistance"
  },
  "300A0132": {
    tag: "(300A,0132)",
    vr: "FL",
    vm: "1",
    name: "SourceToExternalContourDistance"
  },
  "300A0133": {
    tag: "(300A,0133)",
    vr: "FL",
    vm: "3",
    name: "ExternalContourEntryPoint"
  },
  "300A0134": {
    tag: "(300A,0134)",
    vr: "DS",
    vm: "1",
    name: "CumulativeMetersetWeight"
  },
  "300A0140": {
    tag: "(300A,0140)",
    vr: "FL",
    vm: "1",
    name: "TableTopPitchAngle"
  },
  "300A0142": {
    tag: "(300A,0142)",
    vr: "CS",
    vm: "1",
    name: "TableTopPitchRotationDirection"
  },
  "300A0144": {
    tag: "(300A,0144)",
    vr: "FL",
    vm: "1",
    name: "TableTopRollAngle"
  },
  "300A0146": {
    tag: "(300A,0146)",
    vr: "CS",
    vm: "1",
    name: "TableTopRollRotationDirection"
  },
  "300A0148": {
    tag: "(300A,0148)",
    vr: "FL",
    vm: "1",
    name: "HeadFixationAngle"
  },
  "300A014A": {
    tag: "(300A,014A)",
    vr: "FL",
    vm: "1",
    name: "GantryPitchAngle"
  },
  "300A014C": {
    tag: "(300A,014C)",
    vr: "CS",
    vm: "1",
    name: "GantryPitchRotationDirection"
  },
  "300A014E": {
    tag: "(300A,014E)",
    vr: "FL",
    vm: "1",
    name: "GantryPitchAngleTolerance"
  },
  "300A0150": {
    tag: "(300A,0150)",
    vr: "CS",
    vm: "1",
    name: "FixationEye"
  },
  "300A0151": {
    tag: "(300A,0151)",
    vr: "DS",
    vm: "1",
    name: "ChairHeadFramePosition"
  },
  "300A0152": {
    tag: "(300A,0152)",
    vr: "DS",
    vm: "1",
    name: "HeadFixationAngleTolerance"
  },
  "300A0153": {
    tag: "(300A,0153)",
    vr: "DS",
    vm: "1",
    name: "ChairHeadFramePositionTolerance"
  },
  "300A0154": {
    tag: "(300A,0154)",
    vr: "DS",
    vm: "1",
    name: "FixationLightAzimuthalAngleTolerance"
  },
  "300A0155": {
    tag: "(300A,0155)",
    vr: "DS",
    vm: "1",
    name: "FixationLightPolarAngleTolerance"
  },
  "300A0180": {
    tag: "(300A,0180)",
    vr: "SQ",
    vm: "1",
    name: "PatientSetupSequence"
  },
  "300A0182": {
    tag: "(300A,0182)",
    vr: "IS",
    vm: "1",
    name: "PatientSetupNumber"
  },
  "300A0183": {
    tag: "(300A,0183)",
    vr: "LO",
    vm: "1",
    name: "PatientSetupLabel"
  },
  "300A0184": {
    tag: "(300A,0184)",
    vr: "LO",
    vm: "1",
    name: "PatientAdditionalPosition"
  },
  "300A0190": {
    tag: "(300A,0190)",
    vr: "SQ",
    vm: "1",
    name: "FixationDeviceSequence"
  },
  "300A0192": {
    tag: "(300A,0192)",
    vr: "CS",
    vm: "1",
    name: "FixationDeviceType"
  },
  "300A0194": {
    tag: "(300A,0194)",
    vr: "SH",
    vm: "1",
    name: "FixationDeviceLabel"
  },
  "300A0196": {
    tag: "(300A,0196)",
    vr: "ST",
    vm: "1",
    name: "FixationDeviceDescription"
  },
  "300A0198": {
    tag: "(300A,0198)",
    vr: "SH",
    vm: "1",
    name: "FixationDevicePosition"
  },
  "300A0199": {
    tag: "(300A,0199)",
    vr: "FL",
    vm: "1",
    name: "FixationDevicePitchAngle"
  },
  "300A019A": {
    tag: "(300A,019A)",
    vr: "FL",
    vm: "1",
    name: "FixationDeviceRollAngle"
  },
  "300A01A0": {
    tag: "(300A,01A0)",
    vr: "SQ",
    vm: "1",
    name: "ShieldingDeviceSequence"
  },
  "300A01A2": {
    tag: "(300A,01A2)",
    vr: "CS",
    vm: "1",
    name: "ShieldingDeviceType"
  },
  "300A01A4": {
    tag: "(300A,01A4)",
    vr: "SH",
    vm: "1",
    name: "ShieldingDeviceLabel"
  },
  "300A01A6": {
    tag: "(300A,01A6)",
    vr: "ST",
    vm: "1",
    name: "ShieldingDeviceDescription"
  },
  "300A01A8": {
    tag: "(300A,01A8)",
    vr: "SH",
    vm: "1",
    name: "ShieldingDevicePosition"
  },
  "300A01B0": {
    tag: "(300A,01B0)",
    vr: "CS",
    vm: "1",
    name: "SetupTechnique"
  },
  "300A01B2": {
    tag: "(300A,01B2)",
    vr: "ST",
    vm: "1",
    name: "SetupTechniqueDescription"
  },
  "300A01B4": {
    tag: "(300A,01B4)",
    vr: "SQ",
    vm: "1",
    name: "SetupDeviceSequence"
  },
  "300A01B6": {
    tag: "(300A,01B6)",
    vr: "CS",
    vm: "1",
    name: "SetupDeviceType"
  },
  "300A01B8": {
    tag: "(300A,01B8)",
    vr: "SH",
    vm: "1",
    name: "SetupDeviceLabel"
  },
  "300A01BA": {
    tag: "(300A,01BA)",
    vr: "ST",
    vm: "1",
    name: "SetupDeviceDescription"
  },
  "300A01BC": {
    tag: "(300A,01BC)",
    vr: "DS",
    vm: "1",
    name: "SetupDeviceParameter"
  },
  "300A01D0": {
    tag: "(300A,01D0)",
    vr: "ST",
    vm: "1",
    name: "SetupReferenceDescription"
  },
  "300A01D2": {
    tag: "(300A,01D2)",
    vr: "DS",
    vm: "1",
    name: "TableTopVerticalSetupDisplacement"
  },
  "300A01D4": {
    tag: "(300A,01D4)",
    vr: "DS",
    vm: "1",
    name: "TableTopLongitudinalSetupDisplacement"
  },
  "300A01D6": {
    tag: "(300A,01D6)",
    vr: "DS",
    vm: "1",
    name: "TableTopLateralSetupDisplacement"
  },
  "300A0200": {
    tag: "(300A,0200)",
    vr: "CS",
    vm: "1",
    name: "BrachyTreatmentTechnique"
  },
  "300A0202": {
    tag: "(300A,0202)",
    vr: "CS",
    vm: "1",
    name: "BrachyTreatmentType"
  },
  "300A0206": {
    tag: "(300A,0206)",
    vr: "SQ",
    vm: "1",
    name: "TreatmentMachineSequence"
  },
  "300A0210": {
    tag: "(300A,0210)",
    vr: "SQ",
    vm: "1",
    name: "SourceSequence"
  },
  "300A0212": {
    tag: "(300A,0212)",
    vr: "IS",
    vm: "1",
    name: "SourceNumber"
  },
  "300A0214": {
    tag: "(300A,0214)",
    vr: "CS",
    vm: "1",
    name: "SourceType"
  },
  "300A0216": {
    tag: "(300A,0216)",
    vr: "LO",
    vm: "1",
    name: "SourceManufacturer"
  },
  "300A0218": {
    tag: "(300A,0218)",
    vr: "DS",
    vm: "1",
    name: "ActiveSourceDiameter"
  },
  "300A021A": {
    tag: "(300A,021A)",
    vr: "DS",
    vm: "1",
    name: "ActiveSourceLength"
  },
  "300A021B": {
    tag: "(300A,021B)",
    vr: "SH",
    vm: "1",
    name: "SourceModelID"
  },
  "300A021C": {
    tag: "(300A,021C)",
    vr: "LO",
    vm: "1",
    name: "SourceDescription"
  },
  "300A0222": {
    tag: "(300A,0222)",
    vr: "DS",
    vm: "1",
    name: "SourceEncapsulationNominalThickness"
  },
  "300A0224": {
    tag: "(300A,0224)",
    vr: "DS",
    vm: "1",
    name: "SourceEncapsulationNominalTransmission"
  },
  "300A0226": {
    tag: "(300A,0226)",
    vr: "LO",
    vm: "1",
    name: "SourceIsotopeName"
  },
  "300A0228": {
    tag: "(300A,0228)",
    vr: "DS",
    vm: "1",
    name: "SourceIsotopeHalfLife"
  },
  "300A0229": {
    tag: "(300A,0229)",
    vr: "CS",
    vm: "1",
    name: "SourceStrengthUnits"
  },
  "300A022A": {
    tag: "(300A,022A)",
    vr: "DS",
    vm: "1",
    name: "ReferenceAirKermaRate"
  },
  "300A022B": {
    tag: "(300A,022B)",
    vr: "DS",
    vm: "1",
    name: "SourceStrength"
  },
  "300A022C": {
    tag: "(300A,022C)",
    vr: "DA",
    vm: "1",
    name: "SourceStrengthReferenceDate"
  },
  "300A022E": {
    tag: "(300A,022E)",
    vr: "TM",
    vm: "1",
    name: "SourceStrengthReferenceTime"
  },
  "300A0230": {
    tag: "(300A,0230)",
    vr: "SQ",
    vm: "1",
    name: "ApplicationSetupSequence"
  },
  "300A0232": {
    tag: "(300A,0232)",
    vr: "CS",
    vm: "1",
    name: "ApplicationSetupType"
  },
  "300A0234": {
    tag: "(300A,0234)",
    vr: "IS",
    vm: "1",
    name: "ApplicationSetupNumber"
  },
  "300A0236": {
    tag: "(300A,0236)",
    vr: "LO",
    vm: "1",
    name: "ApplicationSetupName"
  },
  "300A0238": {
    tag: "(300A,0238)",
    vr: "LO",
    vm: "1",
    name: "ApplicationSetupManufacturer"
  },
  "300A0240": {
    tag: "(300A,0240)",
    vr: "IS",
    vm: "1",
    name: "TemplateNumber"
  },
  "300A0242": {
    tag: "(300A,0242)",
    vr: "SH",
    vm: "1",
    name: "TemplateType"
  },
  "300A0244": {
    tag: "(300A,0244)",
    vr: "LO",
    vm: "1",
    name: "TemplateName"
  },
  "300A0250": {
    tag: "(300A,0250)",
    vr: "DS",
    vm: "1",
    name: "TotalReferenceAirKerma"
  },
  "300A0260": {
    tag: "(300A,0260)",
    vr: "SQ",
    vm: "1",
    name: "BrachyAccessoryDeviceSequence"
  },
  "300A0262": {
    tag: "(300A,0262)",
    vr: "IS",
    vm: "1",
    name: "BrachyAccessoryDeviceNumber"
  },
  "300A0263": {
    tag: "(300A,0263)",
    vr: "SH",
    vm: "1",
    name: "BrachyAccessoryDeviceID"
  },
  "300A0264": {
    tag: "(300A,0264)",
    vr: "CS",
    vm: "1",
    name: "BrachyAccessoryDeviceType"
  },
  "300A0266": {
    tag: "(300A,0266)",
    vr: "LO",
    vm: "1",
    name: "BrachyAccessoryDeviceName"
  },
  "300A026A": {
    tag: "(300A,026A)",
    vr: "DS",
    vm: "1",
    name: "BrachyAccessoryDeviceNominalThickness"
  },
  "300A026C": {
    tag: "(300A,026C)",
    vr: "DS",
    vm: "1",
    name: "BrachyAccessoryDeviceNominalTransmission"
  },
  "300A0271": {
    tag: "(300A,0271)",
    vr: "DS",
    vm: "1",
    name: "ChannelEffectiveLength"
  },
  "300A0272": {
    tag: "(300A,0272)",
    vr: "DS",
    vm: "1",
    name: "ChannelInnerLength"
  },
  "300A0273": {
    tag: "(300A,0273)",
    vr: "SH",
    vm: "1",
    name: "AfterloaderChannelID"
  },
  "300A0274": {
    tag: "(300A,0274)",
    vr: "DS",
    vm: "1",
    name: "SourceApplicatorTipLength"
  },
  "300A0280": {
    tag: "(300A,0280)",
    vr: "SQ",
    vm: "1",
    name: "ChannelSequence"
  },
  "300A0282": {
    tag: "(300A,0282)",
    vr: "IS",
    vm: "1",
    name: "ChannelNumber"
  },
  "300A0284": {
    tag: "(300A,0284)",
    vr: "DS",
    vm: "1",
    name: "ChannelLength"
  },
  "300A0286": {
    tag: "(300A,0286)",
    vr: "DS",
    vm: "1",
    name: "ChannelTotalTime"
  },
  "300A0288": {
    tag: "(300A,0288)",
    vr: "CS",
    vm: "1",
    name: "SourceMovementType"
  },
  "300A028A": {
    tag: "(300A,028A)",
    vr: "IS",
    vm: "1",
    name: "NumberOfPulses"
  },
  "300A028C": {
    tag: "(300A,028C)",
    vr: "DS",
    vm: "1",
    name: "PulseRepetitionInterval"
  },
  "300A0290": {
    tag: "(300A,0290)",
    vr: "IS",
    vm: "1",
    name: "SourceApplicatorNumber"
  },
  "300A0291": {
    tag: "(300A,0291)",
    vr: "SH",
    vm: "1",
    name: "SourceApplicatorID"
  },
  "300A0292": {
    tag: "(300A,0292)",
    vr: "CS",
    vm: "1",
    name: "SourceApplicatorType"
  },
  "300A0294": {
    tag: "(300A,0294)",
    vr: "LO",
    vm: "1",
    name: "SourceApplicatorName"
  },
  "300A0296": {
    tag: "(300A,0296)",
    vr: "DS",
    vm: "1",
    name: "SourceApplicatorLength"
  },
  "300A0298": {
    tag: "(300A,0298)",
    vr: "LO",
    vm: "1",
    name: "SourceApplicatorManufacturer"
  },
  "300A029C": {
    tag: "(300A,029C)",
    vr: "DS",
    vm: "1",
    name: "SourceApplicatorWallNominalThickness"
  },
  "300A029E": {
    tag: "(300A,029E)",
    vr: "DS",
    vm: "1",
    name: "SourceApplicatorWallNominalTransmission"
  },
  "300A02A0": {
    tag: "(300A,02A0)",
    vr: "DS",
    vm: "1",
    name: "SourceApplicatorStepSize"
  },
  "300A02A2": {
    tag: "(300A,02A2)",
    vr: "IS",
    vm: "1",
    name: "TransferTubeNumber"
  },
  "300A02A4": {
    tag: "(300A,02A4)",
    vr: "DS",
    vm: "1",
    name: "TransferTubeLength"
  },
  "300A02B0": {
    tag: "(300A,02B0)",
    vr: "SQ",
    vm: "1",
    name: "ChannelShieldSequence"
  },
  "300A02B2": {
    tag: "(300A,02B2)",
    vr: "IS",
    vm: "1",
    name: "ChannelShieldNumber"
  },
  "300A02B3": {
    tag: "(300A,02B3)",
    vr: "SH",
    vm: "1",
    name: "ChannelShieldID"
  },
  "300A02B4": {
    tag: "(300A,02B4)",
    vr: "LO",
    vm: "1",
    name: "ChannelShieldName"
  },
  "300A02B8": {
    tag: "(300A,02B8)",
    vr: "DS",
    vm: "1",
    name: "ChannelShieldNominalThickness"
  },
  "300A02BA": {
    tag: "(300A,02BA)",
    vr: "DS",
    vm: "1",
    name: "ChannelShieldNominalTransmission"
  },
  "300A02C8": {
    tag: "(300A,02C8)",
    vr: "DS",
    vm: "1",
    name: "FinalCumulativeTimeWeight"
  },
  "300A02D0": {
    tag: "(300A,02D0)",
    vr: "SQ",
    vm: "1",
    name: "BrachyControlPointSequence"
  },
  "300A02D2": {
    tag: "(300A,02D2)",
    vr: "DS",
    vm: "1",
    name: "ControlPointRelativePosition"
  },
  "300A02D4": {
    tag: "(300A,02D4)",
    vr: "DS",
    vm: "3",
    name: "ControlPoint3DPosition"
  },
  "300A02D6": {
    tag: "(300A,02D6)",
    vr: "DS",
    vm: "1",
    name: "CumulativeTimeWeight"
  },
  "300A02E0": {
    tag: "(300A,02E0)",
    vr: "CS",
    vm: "1",
    name: "CompensatorDivergence"
  },
  "300A02E1": {
    tag: "(300A,02E1)",
    vr: "CS",
    vm: "1",
    name: "CompensatorMountingPosition"
  },
  "300A02E2": {
    tag: "(300A,02E2)",
    vr: "DS",
    vm: "1-n",
    name: "SourceToCompensatorDistance"
  },
  "300A02E3": {
    tag: "(300A,02E3)",
    vr: "FL",
    vm: "1",
    name: "TotalCompensatorTrayWaterEquivalentThickness"
  },
  "300A02E4": {
    tag: "(300A,02E4)",
    vr: "FL",
    vm: "1",
    name: "IsocenterToCompensatorTrayDistance"
  },
  "300A02E5": {
    tag: "(300A,02E5)",
    vr: "FL",
    vm: "1",
    name: "CompensatorColumnOffset"
  },
  "300A02E6": {
    tag: "(300A,02E6)",
    vr: "FL",
    vm: "1-n",
    name: "IsocenterToCompensatorDistances"
  },
  "300A02E7": {
    tag: "(300A,02E7)",
    vr: "FL",
    vm: "1",
    name: "CompensatorRelativeStoppingPowerRatio"
  },
  "300A02E8": {
    tag: "(300A,02E8)",
    vr: "FL",
    vm: "1",
    name: "CompensatorMillingToolDiameter"
  },
  "300A02EA": {
    tag: "(300A,02EA)",
    vr: "SQ",
    vm: "1",
    name: "IonRangeCompensatorSequence"
  },
  "300A02EB": {
    tag: "(300A,02EB)",
    vr: "LT",
    vm: "1",
    name: "CompensatorDescription"
  },
  "300A0302": {
    tag: "(300A,0302)",
    vr: "IS",
    vm: "1",
    name: "RadiationMassNumber"
  },
  "300A0304": {
    tag: "(300A,0304)",
    vr: "IS",
    vm: "1",
    name: "RadiationAtomicNumber"
  },
  "300A0306": {
    tag: "(300A,0306)",
    vr: "SS",
    vm: "1",
    name: "RadiationChargeState"
  },
  "300A0308": {
    tag: "(300A,0308)",
    vr: "CS",
    vm: "1",
    name: "ScanMode"
  },
  "300A0309": {
    tag: "(300A,0309)",
    vr: "CS",
    vm: "1",
    name: "ModulatedScanModeType"
  },
  "300A030A": {
    tag: "(300A,030A)",
    vr: "FL",
    vm: "2",
    name: "VirtualSourceAxisDistances"
  },
  "300A030C": {
    tag: "(300A,030C)",
    vr: "SQ",
    vm: "1",
    name: "SnoutSequence"
  },
  "300A030D": {
    tag: "(300A,030D)",
    vr: "FL",
    vm: "1",
    name: "SnoutPosition"
  },
  "300A030F": {
    tag: "(300A,030F)",
    vr: "SH",
    vm: "1",
    name: "SnoutID"
  },
  "300A0312": {
    tag: "(300A,0312)",
    vr: "IS",
    vm: "1",
    name: "NumberOfRangeShifters"
  },
  "300A0314": {
    tag: "(300A,0314)",
    vr: "SQ",
    vm: "1",
    name: "RangeShifterSequence"
  },
  "300A0316": {
    tag: "(300A,0316)",
    vr: "IS",
    vm: "1",
    name: "RangeShifterNumber"
  },
  "300A0318": {
    tag: "(300A,0318)",
    vr: "SH",
    vm: "1",
    name: "RangeShifterID"
  },
  "300A0320": {
    tag: "(300A,0320)",
    vr: "CS",
    vm: "1",
    name: "RangeShifterType"
  },
  "300A0322": {
    tag: "(300A,0322)",
    vr: "LO",
    vm: "1",
    name: "RangeShifterDescription"
  },
  "300A0330": {
    tag: "(300A,0330)",
    vr: "IS",
    vm: "1",
    name: "NumberOfLateralSpreadingDevices"
  },
  "300A0332": {
    tag: "(300A,0332)",
    vr: "SQ",
    vm: "1",
    name: "LateralSpreadingDeviceSequence"
  },
  "300A0334": {
    tag: "(300A,0334)",
    vr: "IS",
    vm: "1",
    name: "LateralSpreadingDeviceNumber"
  },
  "300A0336": {
    tag: "(300A,0336)",
    vr: "SH",
    vm: "1",
    name: "LateralSpreadingDeviceID"
  },
  "300A0338": {
    tag: "(300A,0338)",
    vr: "CS",
    vm: "1",
    name: "LateralSpreadingDeviceType"
  },
  "300A033A": {
    tag: "(300A,033A)",
    vr: "LO",
    vm: "1",
    name: "LateralSpreadingDeviceDescription"
  },
  "300A033C": {
    tag: "(300A,033C)",
    vr: "FL",
    vm: "1",
    name: "LateralSpreadingDeviceWaterEquivalentThickness"
  },
  "300A0340": {
    tag: "(300A,0340)",
    vr: "IS",
    vm: "1",
    name: "NumberOfRangeModulators"
  },
  "300A0342": {
    tag: "(300A,0342)",
    vr: "SQ",
    vm: "1",
    name: "RangeModulatorSequence"
  },
  "300A0344": {
    tag: "(300A,0344)",
    vr: "IS",
    vm: "1",
    name: "RangeModulatorNumber"
  },
  "300A0346": {
    tag: "(300A,0346)",
    vr: "SH",
    vm: "1",
    name: "RangeModulatorID"
  },
  "300A0348": {
    tag: "(300A,0348)",
    vr: "CS",
    vm: "1",
    name: "RangeModulatorType"
  },
  "300A034A": {
    tag: "(300A,034A)",
    vr: "LO",
    vm: "1",
    name: "RangeModulatorDescription"
  },
  "300A034C": {
    tag: "(300A,034C)",
    vr: "SH",
    vm: "1",
    name: "BeamCurrentModulationID"
  },
  "300A0350": {
    tag: "(300A,0350)",
    vr: "CS",
    vm: "1",
    name: "PatientSupportType"
  },
  "300A0352": {
    tag: "(300A,0352)",
    vr: "SH",
    vm: "1",
    name: "PatientSupportID"
  },
  "300A0354": {
    tag: "(300A,0354)",
    vr: "LO",
    vm: "1",
    name: "PatientSupportAccessoryCode"
  },
  "300A0355": {
    tag: "(300A,0355)",
    vr: "LO",
    vm: "1",
    name: "TrayAccessoryCode"
  },
  "300A0356": {
    tag: "(300A,0356)",
    vr: "FL",
    vm: "1",
    name: "FixationLightAzimuthalAngle"
  },
  "300A0358": {
    tag: "(300A,0358)",
    vr: "FL",
    vm: "1",
    name: "FixationLightPolarAngle"
  },
  "300A035A": {
    tag: "(300A,035A)",
    vr: "FL",
    vm: "1",
    name: "MetersetRate"
  },
  "300A0360": {
    tag: "(300A,0360)",
    vr: "SQ",
    vm: "1",
    name: "RangeShifterSettingsSequence"
  },
  "300A0362": {
    tag: "(300A,0362)",
    vr: "LO",
    vm: "1",
    name: "RangeShifterSetting"
  },
  "300A0364": {
    tag: "(300A,0364)",
    vr: "FL",
    vm: "1",
    name: "IsocenterToRangeShifterDistance"
  },
  "300A0366": {
    tag: "(300A,0366)",
    vr: "FL",
    vm: "1",
    name: "RangeShifterWaterEquivalentThickness"
  },
  "300A0370": {
    tag: "(300A,0370)",
    vr: "SQ",
    vm: "1",
    name: "LateralSpreadingDeviceSettingsSequence"
  },
  "300A0372": {
    tag: "(300A,0372)",
    vr: "LO",
    vm: "1",
    name: "LateralSpreadingDeviceSetting"
  },
  "300A0374": {
    tag: "(300A,0374)",
    vr: "FL",
    vm: "1",
    name: "IsocenterToLateralSpreadingDeviceDistance"
  },
  "300A0380": {
    tag: "(300A,0380)",
    vr: "SQ",
    vm: "1",
    name: "RangeModulatorSettingsSequence"
  },
  "300A0382": {
    tag: "(300A,0382)",
    vr: "FL",
    vm: "1",
    name: "RangeModulatorGatingStartValue"
  },
  "300A0384": {
    tag: "(300A,0384)",
    vr: "FL",
    vm: "1",
    name: "RangeModulatorGatingStopValue"
  },
  "300A0386": {
    tag: "(300A,0386)",
    vr: "FL",
    vm: "1",
    name: "RangeModulatorGatingStartWaterEquivalentThickness"
  },
  "300A0388": {
    tag: "(300A,0388)",
    vr: "FL",
    vm: "1",
    name: "RangeModulatorGatingStopWaterEquivalentThickness"
  },
  "300A038A": {
    tag: "(300A,038A)",
    vr: "FL",
    vm: "1",
    name: "IsocenterToRangeModulatorDistance"
  },
  "300A038F": {
    tag: "(300A,038F)",
    vr: "FL",
    vm: "1-n",
    name: "ScanSpotTimeOffset"
  },
  "300A0390": {
    tag: "(300A,0390)",
    vr: "SH",
    vm: "1",
    name: "ScanSpotTuneID"
  },
  "300A0391": {
    tag: "(300A,0391)",
    vr: "IS",
    vm: "1-n",
    name: "ScanSpotPrescribedIndices"
  },
  "300A0392": {
    tag: "(300A,0392)",
    vr: "IS",
    vm: "1",
    name: "NumberOfScanSpotPositions"
  },
  "300A0393": {
    tag: "(300A,0393)",
    vr: "CS",
    vm: "1",
    name: "ScanSpotReordered"
  },
  "300A0394": {
    tag: "(300A,0394)",
    vr: "FL",
    vm: "1-n",
    name: "ScanSpotPositionMap"
  },
  "300A0395": {
    tag: "(300A,0395)",
    vr: "CS",
    vm: "1",
    name: "ScanSpotReorderingAllowed"
  },
  "300A0396": {
    tag: "(300A,0396)",
    vr: "FL",
    vm: "1-n",
    name: "ScanSpotMetersetWeights"
  },
  "300A0398": {
    tag: "(300A,0398)",
    vr: "FL",
    vm: "2",
    name: "ScanningSpotSize"
  },
  "300A039A": {
    tag: "(300A,039A)",
    vr: "IS",
    vm: "1",
    name: "NumberOfPaintings"
  },
  "300A03A0": {
    tag: "(300A,03A0)",
    vr: "SQ",
    vm: "1",
    name: "IonToleranceTableSequence"
  },
  "300A03A2": {
    tag: "(300A,03A2)",
    vr: "SQ",
    vm: "1",
    name: "IonBeamSequence"
  },
  "300A03A4": {
    tag: "(300A,03A4)",
    vr: "SQ",
    vm: "1",
    name: "IonBeamLimitingDeviceSequence"
  },
  "300A03A6": {
    tag: "(300A,03A6)",
    vr: "SQ",
    vm: "1",
    name: "IonBlockSequence"
  },
  "300A03A8": {
    tag: "(300A,03A8)",
    vr: "SQ",
    vm: "1",
    name: "IonControlPointSequence"
  },
  "300A03AA": {
    tag: "(300A,03AA)",
    vr: "SQ",
    vm: "1",
    name: "IonWedgeSequence"
  },
  "300A03AC": {
    tag: "(300A,03AC)",
    vr: "SQ",
    vm: "1",
    name: "IonWedgePositionSequence"
  },
  "300A0401": {
    tag: "(300A,0401)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedSetupImageSequence"
  },
  "300A0402": {
    tag: "(300A,0402)",
    vr: "ST",
    vm: "1",
    name: "SetupImageComment"
  },
  "300A0410": {
    tag: "(300A,0410)",
    vr: "SQ",
    vm: "1",
    name: "MotionSynchronizationSequence"
  },
  "300A0412": {
    tag: "(300A,0412)",
    vr: "FL",
    vm: "3",
    name: "ControlPointOrientation"
  },
  "300A0420": {
    tag: "(300A,0420)",
    vr: "SQ",
    vm: "1",
    name: "GeneralAccessorySequence"
  },
  "300A0421": {
    tag: "(300A,0421)",
    vr: "SH",
    vm: "1",
    name: "GeneralAccessoryID"
  },
  "300A0422": {
    tag: "(300A,0422)",
    vr: "ST",
    vm: "1",
    name: "GeneralAccessoryDescription"
  },
  "300A0423": {
    tag: "(300A,0423)",
    vr: "CS",
    vm: "1",
    name: "GeneralAccessoryType"
  },
  "300A0424": {
    tag: "(300A,0424)",
    vr: "IS",
    vm: "1",
    name: "GeneralAccessoryNumber"
  },
  "300A0425": {
    tag: "(300A,0425)",
    vr: "FL",
    vm: "1",
    name: "SourceToGeneralAccessoryDistance"
  },
  "300A0431": {
    tag: "(300A,0431)",
    vr: "SQ",
    vm: "1",
    name: "ApplicatorGeometrySequence"
  },
  "300A0432": {
    tag: "(300A,0432)",
    vr: "CS",
    vm: "1",
    name: "ApplicatorApertureShape"
  },
  "300A0433": {
    tag: "(300A,0433)",
    vr: "FL",
    vm: "1",
    name: "ApplicatorOpening"
  },
  "300A0434": {
    tag: "(300A,0434)",
    vr: "FL",
    vm: "1",
    name: "ApplicatorOpeningX"
  },
  "300A0435": {
    tag: "(300A,0435)",
    vr: "FL",
    vm: "1",
    name: "ApplicatorOpeningY"
  },
  "300A0436": {
    tag: "(300A,0436)",
    vr: "FL",
    vm: "1",
    name: "SourceToApplicatorMountingPositionDistance"
  },
  "300A0440": {
    tag: "(300A,0440)",
    vr: "IS",
    vm: "1",
    name: "NumberOfBlockSlabItems"
  },
  "300A0441": {
    tag: "(300A,0441)",
    vr: "SQ",
    vm: "1",
    name: "BlockSlabSequence"
  },
  "300A0442": {
    tag: "(300A,0442)",
    vr: "DS",
    vm: "1",
    name: "BlockSlabThickness"
  },
  "300A0443": {
    tag: "(300A,0443)",
    vr: "US",
    vm: "1",
    name: "BlockSlabNumber"
  },
  "300A0450": {
    tag: "(300A,0450)",
    vr: "SQ",
    vm: "1",
    name: "DeviceMotionControlSequence"
  },
  "300A0451": {
    tag: "(300A,0451)",
    vr: "CS",
    vm: "1",
    name: "DeviceMotionExecutionMode"
  },
  "300A0452": {
    tag: "(300A,0452)",
    vr: "CS",
    vm: "1",
    name: "DeviceMotionObservationMode"
  },
  "300A0453": {
    tag: "(300A,0453)",
    vr: "SQ",
    vm: "1",
    name: "DeviceMotionParameterCodeSequence"
  },
  "300A0501": {
    tag: "(300A,0501)",
    vr: "FL",
    vm: "1",
    name: "DistalDepthFraction"
  },
  "300A0502": {
    tag: "(300A,0502)",
    vr: "FL",
    vm: "1",
    name: "DistalDepth"
  },
  "300A0503": {
    tag: "(300A,0503)",
    vr: "FL",
    vm: "2",
    name: "NominalRangeModulationFractions"
  },
  "300A0504": {
    tag: "(300A,0504)",
    vr: "FL",
    vm: "2",
    name: "NominalRangeModulatedRegionDepths"
  },
  "300A0505": {
    tag: "(300A,0505)",
    vr: "SQ",
    vm: "1",
    name: "DepthDoseParametersSequence"
  },
  "300A0506": {
    tag: "(300A,0506)",
    vr: "SQ",
    vm: "1",
    name: "DeliveredDepthDoseParametersSequence"
  },
  "300A0507": {
    tag: "(300A,0507)",
    vr: "FL",
    vm: "1",
    name: "DeliveredDistalDepthFraction"
  },
  "300A0508": {
    tag: "(300A,0508)",
    vr: "FL",
    vm: "1",
    name: "DeliveredDistalDepth"
  },
  "300A0509": {
    tag: "(300A,0509)",
    vr: "FL",
    vm: "2",
    name: "DeliveredNominalRangeModulationFractions"
  },
  "300A0510": {
    tag: "(300A,0510)",
    vr: "FL",
    vm: "2",
    name: "DeliveredNominalRangeModulatedRegionDepths"
  },
  "300A0511": {
    tag: "(300A,0511)",
    vr: "CS",
    vm: "1",
    name: "DeliveredReferenceDoseDefinition"
  },
  "300A0512": {
    tag: "(300A,0512)",
    vr: "CS",
    vm: "1",
    name: "ReferenceDoseDefinition"
  },
  "300C0002": {
    tag: "(300C,0002)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedRTPlanSequence"
  },
  "300C0004": {
    tag: "(300C,0004)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedBeamSequence"
  },
  "300C0006": {
    tag: "(300C,0006)",
    vr: "IS",
    vm: "1",
    name: "ReferencedBeamNumber"
  },
  "300C0007": {
    tag: "(300C,0007)",
    vr: "IS",
    vm: "1",
    name: "ReferencedReferenceImageNumber"
  },
  "300C0008": {
    tag: "(300C,0008)",
    vr: "DS",
    vm: "1",
    name: "StartCumulativeMetersetWeight"
  },
  "300C0009": {
    tag: "(300C,0009)",
    vr: "DS",
    vm: "1",
    name: "EndCumulativeMetersetWeight"
  },
  "300C000A": {
    tag: "(300C,000A)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedBrachyApplicationSetupSequence"
  },
  "300C000C": {
    tag: "(300C,000C)",
    vr: "IS",
    vm: "1",
    name: "ReferencedBrachyApplicationSetupNumber"
  },
  "300C000E": {
    tag: "(300C,000E)",
    vr: "IS",
    vm: "1",
    name: "ReferencedSourceNumber"
  },
  "300C0020": {
    tag: "(300C,0020)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedFractionGroupSequence"
  },
  "300C0022": {
    tag: "(300C,0022)",
    vr: "IS",
    vm: "1",
    name: "ReferencedFractionGroupNumber"
  },
  "300C0040": {
    tag: "(300C,0040)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedVerificationImageSequence"
  },
  "300C0042": {
    tag: "(300C,0042)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedReferenceImageSequence"
  },
  "300C0050": {
    tag: "(300C,0050)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedDoseReferenceSequence"
  },
  "300C0051": {
    tag: "(300C,0051)",
    vr: "IS",
    vm: "1",
    name: "ReferencedDoseReferenceNumber"
  },
  "300C0055": {
    tag: "(300C,0055)",
    vr: "SQ",
    vm: "1",
    name: "BrachyReferencedDoseReferenceSequence"
  },
  "300C0060": {
    tag: "(300C,0060)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedStructureSetSequence"
  },
  "300C006A": {
    tag: "(300C,006A)",
    vr: "IS",
    vm: "1",
    name: "ReferencedPatientSetupNumber"
  },
  "300C0080": {
    tag: "(300C,0080)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedDoseSequence"
  },
  "300C00A0": {
    tag: "(300C,00A0)",
    vr: "IS",
    vm: "1",
    name: "ReferencedToleranceTableNumber"
  },
  "300C00B0": {
    tag: "(300C,00B0)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedBolusSequence"
  },
  "300C00C0": {
    tag: "(300C,00C0)",
    vr: "IS",
    vm: "1",
    name: "ReferencedWedgeNumber"
  },
  "300C00D0": {
    tag: "(300C,00D0)",
    vr: "IS",
    vm: "1",
    name: "ReferencedCompensatorNumber"
  },
  "300C00E0": {
    tag: "(300C,00E0)",
    vr: "IS",
    vm: "1",
    name: "ReferencedBlockNumber"
  },
  "300C00F0": {
    tag: "(300C,00F0)",
    vr: "IS",
    vm: "1",
    name: "ReferencedControlPointIndex"
  },
  "300C00F2": {
    tag: "(300C,00F2)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedControlPointSequence"
  },
  "300C00F4": {
    tag: "(300C,00F4)",
    vr: "IS",
    vm: "1",
    name: "ReferencedStartControlPointIndex"
  },
  "300C00F6": {
    tag: "(300C,00F6)",
    vr: "IS",
    vm: "1",
    name: "ReferencedStopControlPointIndex"
  },
  "300C0100": {
    tag: "(300C,0100)",
    vr: "IS",
    vm: "1",
    name: "ReferencedRangeShifterNumber"
  },
  "300C0102": {
    tag: "(300C,0102)",
    vr: "IS",
    vm: "1",
    name: "ReferencedLateralSpreadingDeviceNumber"
  },
  "300C0104": {
    tag: "(300C,0104)",
    vr: "IS",
    vm: "1",
    name: "ReferencedRangeModulatorNumber"
  },
  "300C0111": {
    tag: "(300C,0111)",
    vr: "SQ",
    vm: "1",
    name: "OmittedBeamTaskSequence"
  },
  "300C0112": {
    tag: "(300C,0112)",
    vr: "CS",
    vm: "1",
    name: "ReasonForOmission"
  },
  "300C0113": {
    tag: "(300C,0113)",
    vr: "LO",
    vm: "1",
    name: "ReasonForOmissionDescription"
  },
  "300E0002": {
    tag: "(300E,0002)",
    vr: "CS",
    vm: "1",
    name: "ApprovalStatus"
  },
  "300E0004": {
    tag: "(300E,0004)",
    vr: "DA",
    vm: "1",
    name: "ReviewDate"
  },
  "300E0005": {
    tag: "(300E,0005)",
    vr: "TM",
    vm: "1",
    name: "ReviewTime"
  },
  "300E0008": {
    tag: "(300E,0008)",
    vr: "PN",
    vm: "1",
    name: "ReviewerName"
  },
  40000010: {
    tag: "(4000,0010)",
    vr: "LT",
    vm: "1",
    name: "Arbitrary"
  },
  40004000: {
    tag: "(4000,4000)",
    vr: "LT",
    vm: "1",
    name: "TextComments"
  },
  40080040: {
    tag: "(4008,0040)",
    vr: "SH",
    vm: "1",
    name: "ResultsID"
  },
  40080042: {
    tag: "(4008,0042)",
    vr: "LO",
    vm: "1",
    name: "ResultsIDIssuer"
  },
  40080050: {
    tag: "(4008,0050)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedInterpretationSequence"
  },
  "400800FF": {
    tag: "(4008,00FF)",
    vr: "CS",
    vm: "1",
    name: "ReportProductionStatusTrial"
  },
  40080100: {
    tag: "(4008,0100)",
    vr: "DA",
    vm: "1",
    name: "InterpretationRecordedDate"
  },
  40080101: {
    tag: "(4008,0101)",
    vr: "TM",
    vm: "1",
    name: "InterpretationRecordedTime"
  },
  40080102: {
    tag: "(4008,0102)",
    vr: "PN",
    vm: "1",
    name: "InterpretationRecorder"
  },
  40080103: {
    tag: "(4008,0103)",
    vr: "LO",
    vm: "1",
    name: "ReferenceToRecordedSound"
  },
  40080108: {
    tag: "(4008,0108)",
    vr: "DA",
    vm: "1",
    name: "InterpretationTranscriptionDate"
  },
  40080109: {
    tag: "(4008,0109)",
    vr: "TM",
    vm: "1",
    name: "InterpretationTranscriptionTime"
  },
  "4008010A": {
    tag: "(4008,010A)",
    vr: "PN",
    vm: "1",
    name: "InterpretationTranscriber"
  },
  "4008010B": {
    tag: "(4008,010B)",
    vr: "ST",
    vm: "1",
    name: "InterpretationText"
  },
  "4008010C": {
    tag: "(4008,010C)",
    vr: "PN",
    vm: "1",
    name: "InterpretationAuthor"
  },
  40080111: {
    tag: "(4008,0111)",
    vr: "SQ",
    vm: "1",
    name: "InterpretationApproverSequence"
  },
  40080112: {
    tag: "(4008,0112)",
    vr: "DA",
    vm: "1",
    name: "InterpretationApprovalDate"
  },
  40080113: {
    tag: "(4008,0113)",
    vr: "TM",
    vm: "1",
    name: "InterpretationApprovalTime"
  },
  40080114: {
    tag: "(4008,0114)",
    vr: "PN",
    vm: "1",
    name: "PhysicianApprovingInterpretation"
  },
  40080115: {
    tag: "(4008,0115)",
    vr: "LT",
    vm: "1",
    name: "InterpretationDiagnosisDescription"
  },
  40080117: {
    tag: "(4008,0117)",
    vr: "SQ",
    vm: "1",
    name: "InterpretationDiagnosisCodeSequence"
  },
  40080118: {
    tag: "(4008,0118)",
    vr: "SQ",
    vm: "1",
    name: "ResultsDistributionListSequence"
  },
  40080119: {
    tag: "(4008,0119)",
    vr: "PN",
    vm: "1",
    name: "DistributionName"
  },
  "4008011A": {
    tag: "(4008,011A)",
    vr: "LO",
    vm: "1",
    name: "DistributionAddress"
  },
  40080200: {
    tag: "(4008,0200)",
    vr: "SH",
    vm: "1",
    name: "InterpretationID"
  },
  40080202: {
    tag: "(4008,0202)",
    vr: "LO",
    vm: "1",
    name: "InterpretationIDIssuer"
  },
  40080210: {
    tag: "(4008,0210)",
    vr: "CS",
    vm: "1",
    name: "InterpretationTypeID"
  },
  40080212: {
    tag: "(4008,0212)",
    vr: "CS",
    vm: "1",
    name: "InterpretationStatusID"
  },
  40080300: {
    tag: "(4008,0300)",
    vr: "ST",
    vm: "1",
    name: "Impressions"
  },
  40084000: {
    tag: "(4008,4000)",
    vr: "ST",
    vm: "1",
    name: "ResultsComments"
  },
  40100001: {
    tag: "(4010,0001)",
    vr: "CS",
    vm: "1",
    name: "LowEnergyDetectors"
  },
  40100002: {
    tag: "(4010,0002)",
    vr: "CS",
    vm: "1",
    name: "HighEnergyDetectors"
  },
  40100004: {
    tag: "(4010,0004)",
    vr: "SQ",
    vm: "1",
    name: "DetectorGeometrySequence"
  },
  40101001: {
    tag: "(4010,1001)",
    vr: "SQ",
    vm: "1",
    name: "ThreatROIVoxelSequence"
  },
  40101004: {
    tag: "(4010,1004)",
    vr: "FL",
    vm: "3",
    name: "ThreatROIBase"
  },
  40101005: {
    tag: "(4010,1005)",
    vr: "FL",
    vm: "3",
    name: "ThreatROIExtents"
  },
  40101006: {
    tag: "(4010,1006)",
    vr: "OB",
    vm: "1",
    name: "ThreatROIBitmap"
  },
  40101007: {
    tag: "(4010,1007)",
    vr: "SH",
    vm: "1",
    name: "RouteSegmentID"
  },
  40101008: {
    tag: "(4010,1008)",
    vr: "CS",
    vm: "1",
    name: "GantryType"
  },
  40101009: {
    tag: "(4010,1009)",
    vr: "CS",
    vm: "1",
    name: "OOIOwnerType"
  },
  "4010100A": {
    tag: "(4010,100A)",
    vr: "SQ",
    vm: "1",
    name: "RouteSegmentSequence"
  },
  40101010: {
    tag: "(4010,1010)",
    vr: "US",
    vm: "1",
    name: "PotentialThreatObjectID"
  },
  40101011: {
    tag: "(4010,1011)",
    vr: "SQ",
    vm: "1",
    name: "ThreatSequence"
  },
  40101012: {
    tag: "(4010,1012)",
    vr: "CS",
    vm: "1",
    name: "ThreatCategory"
  },
  40101013: {
    tag: "(4010,1013)",
    vr: "LT",
    vm: "1",
    name: "ThreatCategoryDescription"
  },
  40101014: {
    tag: "(4010,1014)",
    vr: "CS",
    vm: "1",
    name: "ATDAbilityAssessment"
  },
  40101015: {
    tag: "(4010,1015)",
    vr: "CS",
    vm: "1",
    name: "ATDAssessmentFlag"
  },
  40101016: {
    tag: "(4010,1016)",
    vr: "FL",
    vm: "1",
    name: "ATDAssessmentProbability"
  },
  40101017: {
    tag: "(4010,1017)",
    vr: "FL",
    vm: "1",
    name: "Mass"
  },
  40101018: {
    tag: "(4010,1018)",
    vr: "FL",
    vm: "1",
    name: "Density"
  },
  40101019: {
    tag: "(4010,1019)",
    vr: "FL",
    vm: "1",
    name: "ZEffective"
  },
  "4010101A": {
    tag: "(4010,101A)",
    vr: "SH",
    vm: "1",
    name: "BoardingPassID"
  },
  "4010101B": {
    tag: "(4010,101B)",
    vr: "FL",
    vm: "3",
    name: "CenterOfMass"
  },
  "4010101C": {
    tag: "(4010,101C)",
    vr: "FL",
    vm: "3",
    name: "CenterOfPTO"
  },
  "4010101D": {
    tag: "(4010,101D)",
    vr: "FL",
    vm: "6-n",
    name: "BoundingPolygon"
  },
  "4010101E": {
    tag: "(4010,101E)",
    vr: "SH",
    vm: "1",
    name: "RouteSegmentStartLocationID"
  },
  "4010101F": {
    tag: "(4010,101F)",
    vr: "SH",
    vm: "1",
    name: "RouteSegmentEndLocationID"
  },
  40101020: {
    tag: "(4010,1020)",
    vr: "CS",
    vm: "1",
    name: "RouteSegmentLocationIDType"
  },
  40101021: {
    tag: "(4010,1021)",
    vr: "CS",
    vm: "1-n",
    name: "AbortReason"
  },
  40101023: {
    tag: "(4010,1023)",
    vr: "FL",
    vm: "1",
    name: "VolumeOfPTO"
  },
  40101024: {
    tag: "(4010,1024)",
    vr: "CS",
    vm: "1",
    name: "AbortFlag"
  },
  40101025: {
    tag: "(4010,1025)",
    vr: "DT",
    vm: "1",
    name: "RouteSegmentStartTime"
  },
  40101026: {
    tag: "(4010,1026)",
    vr: "DT",
    vm: "1",
    name: "RouteSegmentEndTime"
  },
  40101027: {
    tag: "(4010,1027)",
    vr: "CS",
    vm: "1",
    name: "TDRType"
  },
  40101028: {
    tag: "(4010,1028)",
    vr: "CS",
    vm: "1",
    name: "InternationalRouteSegment"
  },
  40101029: {
    tag: "(4010,1029)",
    vr: "LO",
    vm: "1-n",
    name: "ThreatDetectionAlgorithmandVersion"
  },
  "4010102A": {
    tag: "(4010,102A)",
    vr: "SH",
    vm: "1",
    name: "AssignedLocation"
  },
  "4010102B": {
    tag: "(4010,102B)",
    vr: "DT",
    vm: "1",
    name: "AlarmDecisionTime"
  },
  40101031: {
    tag: "(4010,1031)",
    vr: "CS",
    vm: "1",
    name: "AlarmDecision"
  },
  40101033: {
    tag: "(4010,1033)",
    vr: "US",
    vm: "1",
    name: "NumberOfTotalObjects"
  },
  40101034: {
    tag: "(4010,1034)",
    vr: "US",
    vm: "1",
    name: "NumberOfAlarmObjects"
  },
  40101037: {
    tag: "(4010,1037)",
    vr: "SQ",
    vm: "1",
    name: "PTORepresentationSequence"
  },
  40101038: {
    tag: "(4010,1038)",
    vr: "SQ",
    vm: "1",
    name: "ATDAssessmentSequence"
  },
  40101039: {
    tag: "(4010,1039)",
    vr: "CS",
    vm: "1",
    name: "TIPType"
  },
  "4010103A": {
    tag: "(4010,103A)",
    vr: "CS",
    vm: "1",
    name: "DICOSVersion"
  },
  40101041: {
    tag: "(4010,1041)",
    vr: "DT",
    vm: "1",
    name: "OOIOwnerCreationTime"
  },
  40101042: {
    tag: "(4010,1042)",
    vr: "CS",
    vm: "1",
    name: "OOIType"
  },
  40101043: {
    tag: "(4010,1043)",
    vr: "FL",
    vm: "3",
    name: "OOISize"
  },
  40101044: {
    tag: "(4010,1044)",
    vr: "CS",
    vm: "1",
    name: "AcquisitionStatus"
  },
  40101045: {
    tag: "(4010,1045)",
    vr: "SQ",
    vm: "1",
    name: "BasisMaterialsCodeSequence"
  },
  40101046: {
    tag: "(4010,1046)",
    vr: "CS",
    vm: "1",
    name: "PhantomType"
  },
  40101047: {
    tag: "(4010,1047)",
    vr: "SQ",
    vm: "1",
    name: "OOIOwnerSequence"
  },
  40101048: {
    tag: "(4010,1048)",
    vr: "CS",
    vm: "1",
    name: "ScanType"
  },
  40101051: {
    tag: "(4010,1051)",
    vr: "LO",
    vm: "1",
    name: "ItineraryID"
  },
  40101052: {
    tag: "(4010,1052)",
    vr: "SH",
    vm: "1",
    name: "ItineraryIDType"
  },
  40101053: {
    tag: "(4010,1053)",
    vr: "LO",
    vm: "1",
    name: "ItineraryIDAssigningAuthority"
  },
  40101054: {
    tag: "(4010,1054)",
    vr: "SH",
    vm: "1",
    name: "RouteID"
  },
  40101055: {
    tag: "(4010,1055)",
    vr: "SH",
    vm: "1",
    name: "RouteIDAssigningAuthority"
  },
  40101056: {
    tag: "(4010,1056)",
    vr: "CS",
    vm: "1",
    name: "InboundArrivalType"
  },
  40101058: {
    tag: "(4010,1058)",
    vr: "SH",
    vm: "1",
    name: "CarrierID"
  },
  40101059: {
    tag: "(4010,1059)",
    vr: "CS",
    vm: "1",
    name: "CarrierIDAssigningAuthority"
  },
  40101060: {
    tag: "(4010,1060)",
    vr: "FL",
    vm: "3",
    name: "SourceOrientation"
  },
  40101061: {
    tag: "(4010,1061)",
    vr: "FL",
    vm: "3",
    name: "SourcePosition"
  },
  40101062: {
    tag: "(4010,1062)",
    vr: "FL",
    vm: "1",
    name: "BeltHeight"
  },
  40101064: {
    tag: "(4010,1064)",
    vr: "SQ",
    vm: "1",
    name: "AlgorithmRoutingCodeSequence"
  },
  40101067: {
    tag: "(4010,1067)",
    vr: "CS",
    vm: "1",
    name: "TransportClassification"
  },
  40101068: {
    tag: "(4010,1068)",
    vr: "LT",
    vm: "1",
    name: "OOITypeDescriptor"
  },
  40101069: {
    tag: "(4010,1069)",
    vr: "FL",
    vm: "1",
    name: "TotalProcessingTime"
  },
  "4010106C": {
    tag: "(4010,106C)",
    vr: "OB",
    vm: "1",
    name: "DetectorCalibrationData"
  },
  "4010106D": {
    tag: "(4010,106D)",
    vr: "CS",
    vm: "1",
    name: "AdditionalScreeningPerformed"
  },
  "4010106E": {
    tag: "(4010,106E)",
    vr: "CS",
    vm: "1",
    name: "AdditionalInspectionSelectionCriteria"
  },
  "4010106F": {
    tag: "(4010,106F)",
    vr: "SQ",
    vm: "1",
    name: "AdditionalInspectionMethodSequence"
  },
  40101070: {
    tag: "(4010,1070)",
    vr: "CS",
    vm: "1",
    name: "AITDeviceType"
  },
  40101071: {
    tag: "(4010,1071)",
    vr: "SQ",
    vm: "1",
    name: "QRMeasurementsSequence"
  },
  40101072: {
    tag: "(4010,1072)",
    vr: "SQ",
    vm: "1",
    name: "TargetMaterialSequence"
  },
  40101073: {
    tag: "(4010,1073)",
    vr: "FD",
    vm: "1",
    name: "SNRThreshold"
  },
  40101075: {
    tag: "(4010,1075)",
    vr: "DS",
    vm: "1",
    name: "ImageScaleRepresentation"
  },
  40101076: {
    tag: "(4010,1076)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedPTOSequence"
  },
  40101077: {
    tag: "(4010,1077)",
    vr: "SQ",
    vm: "1",
    name: "ReferencedTDRInstanceSequence"
  },
  40101078: {
    tag: "(4010,1078)",
    vr: "ST",
    vm: "1",
    name: "PTOLocationDescription"
  },
  40101079: {
    tag: "(4010,1079)",
    vr: "SQ",
    vm: "1",
    name: "AnomalyLocatorIndicatorSequence"
  },
  "4010107A": {
    tag: "(4010,107A)",
    vr: "FL",
    vm: "3",
    name: "AnomalyLocatorIndicator"
  },
  "4010107B": {
    tag: "(4010,107B)",
    vr: "SQ",
    vm: "1",
    name: "PTORegionSequence"
  },
  "4010107C": {
    tag: "(4010,107C)",
    vr: "CS",
    vm: "1",
    name: "InspectionSelectionCriteria"
  },
  "4010107D": {
    tag: "(4010,107D)",
    vr: "SQ",
    vm: "1",
    name: "SecondaryInspectionMethodSequence"
  },
  "4010107E": {
    tag: "(4010,107E)",
    vr: "DS",
    vm: "6",
    name: "PRCSToRCSOrientation"
  },
  "4FFE0001": {
    tag: "(4FFE,0001)",
    vr: "SQ",
    vm: "1",
    name: "MACParametersSequence"
  },
  "50xx0005": {
    tag: "(50xx,0005)",
    vr: "US",
    vm: "1",
    name: "CurveDimensions"
  },
  "50xx0010": {
    tag: "(50xx,0010)",
    vr: "US",
    vm: "1",
    name: "NumberOfPoints"
  },
  "50xx0020": {
    tag: "(50xx,0020)",
    vr: "CS",
    vm: "1",
    name: "TypeOfData"
  },
  "50xx0022": {
    tag: "(50xx,0022)",
    vr: "LO",
    vm: "1",
    name: "CurveDescription"
  },
  "50xx0030": {
    tag: "(50xx,0030)",
    vr: "SH",
    vm: "1-n",
    name: "AxisUnits"
  },
  "50xx0040": {
    tag: "(50xx,0040)",
    vr: "SH",
    vm: "1-n",
    name: "AxisLabels"
  },
  "50xx0103": {
    tag: "(50xx,0103)",
    vr: "US",
    vm: "1",
    name: "DataValueRepresentation"
  },
  "50xx0104": {
    tag: "(50xx,0104)",
    vr: "US",
    vm: "1-n",
    name: "MinimumCoordinateValue"
  },
  "50xx0105": {
    tag: "(50xx,0105)",
    vr: "US",
    vm: "1-n",
    name: "MaximumCoordinateValue"
  },
  "50xx0106": {
    tag: "(50xx,0106)",
    vr: "SH",
    vm: "1-n",
    name: "CurveRange"
  },
  "50xx0110": {
    tag: "(50xx,0110)",
    vr: "US",
    vm: "1-n",
    name: "CurveDataDescriptor"
  },
  "50xx0112": {
    tag: "(50xx,0112)",
    vr: "US",
    vm: "1-n",
    name: "CoordinateStartValue"
  },
  "50xx0114": {
    tag: "(50xx,0114)",
    vr: "US",
    vm: "1-n",
    name: "CoordinateStepValue"
  },
  "50xx1001": {
    tag: "(50xx,1001)",
    vr: "CS",
    vm: "1",
    name: "CurveActivationLayer"
  },
  "50xx2000": {
    tag: "(50xx,2000)",
    vr: "US",
    vm: "1",
    name: "AudioType"
  },
  "50xx2002": {
    tag: "(50xx,2002)",
    vr: "US",
    vm: "1",
    name: "AudioSampleFormat"
  },
  "50xx2004": {
    tag: "(50xx,2004)",
    vr: "US",
    vm: "1",
    name: "NumberOfChannels"
  },
  "50xx2006": {
    tag: "(50xx,2006)",
    vr: "UL",
    vm: "1",
    name: "NumberOfSamples"
  },
  "50xx2008": {
    tag: "(50xx,2008)",
    vr: "UL",
    vm: "1",
    name: "SampleRate"
  },
  "50xx200A": {
    tag: "(50xx,200A)",
    vr: "UL",
    vm: "1",
    name: "TotalTime"
  },
  "50xx200C": {
    tag: "(50xx,200C)",
    vr: "OB|OW",
    vm: "1",
    name: "AudioSampleData"
  },
  "50xx200E": {
    tag: "(50xx,200E)",
    vr: "LT",
    vm: "1",
    name: "AudioComments"
  },
  "50xx2500": {
    tag: "(50xx,2500)",
    vr: "LO",
    vm: "1",
    name: "CurveLabel"
  },
  "50xx2600": {
    tag: "(50xx,2600)",
    vr: "SQ",
    vm: "1",
    name: "CurveReferencedOverlaySequence"
  },
  "50xx2610": {
    tag: "(50xx,2610)",
    vr: "US",
    vm: "1",
    name: "CurveReferencedOverlayGroup"
  },
  "50xx3000": {
    tag: "(50xx,3000)",
    vr: "OB|OW",
    vm: "1",
    name: "CurveData"
  },
  52009229: {
    tag: "(5200,9229)",
    vr: "SQ",
    vm: "1",
    name: "SharedFunctionalGroupsSequence"
  },
  52009230: {
    tag: "(5200,9230)",
    vr: "SQ",
    vm: "1",
    name: "PerFrameFunctionalGroupsSequence"
  },
  54000100: {
    tag: "(5400,0100)",
    vr: "SQ",
    vm: "1",
    name: "WaveformSequence"
  },
  54000110: {
    tag: "(5400,0110)",
    vr: "OB|OW",
    vm: "1",
    name: "ChannelMinimumValue"
  },
  54000112: {
    tag: "(5400,0112)",
    vr: "OB|OW",
    vm: "1",
    name: "ChannelMaximumValue"
  },
  54001004: {
    tag: "(5400,1004)",
    vr: "US",
    vm: "1",
    name: "WaveformBitsAllocated"
  },
  54001006: {
    tag: "(5400,1006)",
    vr: "CS",
    vm: "1",
    name: "WaveformSampleInterpretation"
  },
  "5400100A": {
    tag: "(5400,100A)",
    vr: "OB|OW",
    vm: "1",
    name: "WaveformPaddingValue"
  },
  54001010: {
    tag: "(5400,1010)",
    vr: "OB|OW",
    vm: "1",
    name: "WaveformData"
  },
  56000010: {
    tag: "(5600,0010)",
    vr: "OF",
    vm: "1",
    name: "FirstOrderPhaseCorrectionAngle"
  },
  56000020: {
    tag: "(5600,0020)",
    vr: "OF",
    vm: "1",
    name: "SpectroscopyData"
  },
  "60xx0010": {
    tag: "(60xx,0010)",
    vr: "US",
    vm: "1",
    name: "OverlayRows"
  },
  "60xx0011": {
    tag: "(60xx,0011)",
    vr: "US",
    vm: "1",
    name: "OverlayColumns"
  },
  "60xx0012": {
    tag: "(60xx,0012)",
    vr: "US",
    vm: "1",
    name: "OverlayPlanes"
  },
  "60xx0015": {
    tag: "(60xx,0015)",
    vr: "IS",
    vm: "1",
    name: "NumberOfFramesInOverlay"
  },
  "60xx0022": {
    tag: "(60xx,0022)",
    vr: "LO",
    vm: "1",
    name: "OverlayDescription"
  },
  "60xx0040": {
    tag: "(60xx,0040)",
    vr: "CS",
    vm: "1",
    name: "OverlayType"
  },
  "60xx0045": {
    tag: "(60xx,0045)",
    vr: "LO",
    vm: "1",
    name: "OverlaySubtype"
  },
  "60xx0050": {
    tag: "(60xx,0050)",
    vr: "SS",
    vm: "2",
    name: "OverlayOrigin"
  },
  "60xx0051": {
    tag: "(60xx,0051)",
    vr: "US",
    vm: "1",
    name: "ImageFrameOrigin"
  },
  "60xx0052": {
    tag: "(60xx,0052)",
    vr: "US",
    vm: "1",
    name: "OverlayPlaneOrigin"
  },
  "60xx0060": {
    tag: "(60xx,0060)",
    vr: "CS",
    vm: "1",
    name: "OverlayCompressionCode"
  },
  "60xx0061": {
    tag: "(60xx,0061)",
    vr: "SH",
    vm: "1",
    name: "OverlayCompressionOriginator"
  },
  "60xx0062": {
    tag: "(60xx,0062)",
    vr: "SH",
    vm: "1",
    name: "OverlayCompressionLabel"
  },
  "60xx0063": {
    tag: "(60xx,0063)",
    vr: "CS",
    vm: "1",
    name: "OverlayCompressionDescription"
  },
  "60xx0066": {
    tag: "(60xx,0066)",
    vr: "AT",
    vm: "1-n",
    name: "OverlayCompressionStepPointers"
  },
  "60xx0068": {
    tag: "(60xx,0068)",
    vr: "US",
    vm: "1",
    name: "OverlayRepeatInterval"
  },
  "60xx0069": {
    tag: "(60xx,0069)",
    vr: "US",
    vm: "1",
    name: "OverlayBitsGrouped"
  },
  "60xx0100": {
    tag: "(60xx,0100)",
    vr: "US",
    vm: "1",
    name: "OverlayBitsAllocated"
  },
  "60xx0102": {
    tag: "(60xx,0102)",
    vr: "US",
    vm: "1",
    name: "OverlayBitPosition"
  },
  "60xx0110": {
    tag: "(60xx,0110)",
    vr: "CS",
    vm: "1",
    name: "OverlayFormat"
  },
  "60xx0200": {
    tag: "(60xx,0200)",
    vr: "US",
    vm: "1",
    name: "OverlayLocation"
  },
  "60xx0800": {
    tag: "(60xx,0800)",
    vr: "CS",
    vm: "1-n",
    name: "OverlayCodeLabel"
  },
  "60xx0802": {
    tag: "(60xx,0802)",
    vr: "US",
    vm: "1",
    name: "OverlayNumberOfTables"
  },
  "60xx0803": {
    tag: "(60xx,0803)",
    vr: "AT",
    vm: "1-n",
    name: "OverlayCodeTableLocation"
  },
  "60xx0804": {
    tag: "(60xx,0804)",
    vr: "US",
    vm: "1",
    name: "OverlayBitsForCodeWord"
  },
  "60xx1001": {
    tag: "(60xx,1001)",
    vr: "CS",
    vm: "1",
    name: "OverlayActivationLayer"
  },
  "60xx1100": {
    tag: "(60xx,1100)",
    vr: "US",
    vm: "1",
    name: "OverlayDescriptorGray"
  },
  "60xx1101": {
    tag: "(60xx,1101)",
    vr: "US",
    vm: "1",
    name: "OverlayDescriptorRed"
  },
  "60xx1102": {
    tag: "(60xx,1102)",
    vr: "US",
    vm: "1",
    name: "OverlayDescriptorGreen"
  },
  "60xx1103": {
    tag: "(60xx,1103)",
    vr: "US",
    vm: "1",
    name: "OverlayDescriptorBlue"
  },
  "60xx1200": {
    tag: "(60xx,1200)",
    vr: "US",
    vm: "1-n",
    name: "OverlaysGray"
  },
  "60xx1201": {
    tag: "(60xx,1201)",
    vr: "US",
    vm: "1-n",
    name: "OverlaysRed"
  },
  "60xx1202": {
    tag: "(60xx,1202)",
    vr: "US",
    vm: "1-n",
    name: "OverlaysGreen"
  },
  "60xx1203": {
    tag: "(60xx,1203)",
    vr: "US",
    vm: "1-n",
    name: "OverlaysBlue"
  },
  "60xx1301": {
    tag: "(60xx,1301)",
    vr: "IS",
    vm: "1",
    name: "ROIArea"
  },
  "60xx1302": {
    tag: "(60xx,1302)",
    vr: "DS",
    vm: "1",
    name: "ROIMean"
  },
  "60xx1303": {
    tag: "(60xx,1303)",
    vr: "DS",
    vm: "1",
    name: "ROIStandardDeviation"
  },
  "60xx1500": {
    tag: "(60xx,1500)",
    vr: "LO",
    vm: "1",
    name: "OverlayLabel"
  },
  "60xx3000": {
    tag: "(60xx,3000)",
    vr: "OB|OW",
    vm: "1",
    name: "OverlayData"
  },
  "60xx4000": {
    tag: "(60xx,4000)",
    vr: "LT",
    vm: "1",
    name: "OverlayComments"
  },
  "7FE00008": {
    tag: "(7FE0,0008)",
    vr: "OF",
    vm: "1",
    name: "FloatPixelData"
  },
  "7FE00009": {
    tag: "(7FE0,0009)",
    vr: "OD",
    vm: "1",
    name: "DoubleFloatPixelData"
  },
  "7FE00010": {
    tag: "(7FE0,0010)",
    vr: "OB|OW",
    vm: "1",
    name: "PixelData"
  },
  "7FE00020": {
    tag: "(7FE0,0020)",
    vr: "OW",
    vm: "1",
    name: "CoefficientsSDVN"
  },
  "7FE00030": {
    tag: "(7FE0,0030)",
    vr: "OW",
    vm: "1",
    name: "CoefficientsSDHN"
  },
  "7FE00040": {
    tag: "(7FE0,0040)",
    vr: "OW",
    vm: "1",
    name: "CoefficientsSDDN"
  },
  "7Fxx0010": {
    tag: "(7Fxx,0010)",
    vr: "OB|OW",
    vm: "1",
    name: "VariablePixelData"
  },
  "7Fxx0011": {
    tag: "(7Fxx,0011)",
    vr: "US",
    vm: "1",
    name: "VariableNextDataGroup"
  },
  "7Fxx0020": {
    tag: "(7Fxx,0020)",
    vr: "OW",
    vm: "1",
    name: "VariableCoefficientsSDVN"
  },
  "7Fxx0030": {
    tag: "(7Fxx,0030)",
    vr: "OW",
    vm: "1",
    name: "VariableCoefficientsSDHN"
  },
  "7Fxx0040": {
    tag: "(7Fxx,0040)",
    vr: "OW",
    vm: "1",
    name: "VariableCoefficientsSDDN"
  },
  FFFAFFFA: {
    tag: "(FFFA,FFFA)",
    vr: "SQ",
    vm: "1",
    name: "DigitalSignaturesSequence"
  },
  FFFCFFFC: {
    tag: "(FFFC,FFFC)",
    vr: "OB",
    vm: "1",
    name: "DataSetTrailingPadding"
  },
  FFFEE000: {
    tag: "(FFFE,E000)",
    vr: "",
    vm: "1",
    name: "Item"
  },
  FFFEE00D: {
    tag: "(FFFE,E00D)",
    vr: "",
    vm: "1",
    name: "ItemDelimitationItem"
  },
  FFFEE0DD: {
    tag: "(FFFE,E0DD)",
    vr: "",
    vm: "1",
    name: "SequenceDelimitationItem"
  }
};
module.exports = TAG_DICT;

/***/ }),

/***/ "./lib/groupMain.js":
/*!**************************!*\
  !*** ./lib/groupMain.js ***!
  \**************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const StaticWado = __webpack_require__(/*! ./StaticWado */ "./lib/StaticWado.ts");

const adaptProgramOpts = __webpack_require__(/*! ./util/adaptProgramOpts */ "./lib/util/adaptProgramOpts.js");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, { ...this,
    isInstance: false,
    isGroup: true,
    isStudyData: false
  });
  const importer = new StaticWado(finalOptions); // Either do a scan or on specified studies

  return importer.executeCommand(program.args);
};

/***/ }),

/***/ "./lib/instanceMain.js":
/*!*****************************!*\
  !*** ./lib/instanceMain.js ***!
  \*****************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const StaticWado = __webpack_require__(/*! ./StaticWado */ "./lib/StaticWado.ts");

const adaptProgramOpts = __webpack_require__(/*! ./util/adaptProgramOpts */ "./lib/util/adaptProgramOpts.js");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, { ...this,
    isInstance: true,
    isGroup: false,
    isStudyData: false
  });
  const importer = new StaticWado(finalOptions);
  return importer.executeCommand(program.args);
};

/***/ }),

/***/ "./lib/metadataMain.js":
/*!*****************************!*\
  !*** ./lib/metadataMain.js ***!
  \*****************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const StaticWado = __webpack_require__(/*! ./StaticWado */ "./lib/StaticWado.ts");

const adaptProgramOpts = __webpack_require__(/*! ./util/adaptProgramOpts */ "./lib/util/adaptProgramOpts.js");

module.exports = function createMain(options, program) {
  const finalOptions = adaptProgramOpts(options, { ...this,
    isInstance: false,
    isGroup: false,
    isStudyData: false
  });
  const importer = new StaticWado(finalOptions); // Either do a scan or on specified studies

  return importer.executeCommand(program.args);
};

/***/ }),

/***/ "./lib/mkdicomwebConfig.js":
/*!*********************************!*\
  !*** ./lib/mkdicomwebConfig.js ***!
  \*********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const ConfigPoint = __webpack_require__(/*! config-point */ "./node_modules/config-point/dist/index.umd.js");

const {
  staticWadoConfig
} = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const createMain = __webpack_require__(/*! ./createMain */ "./lib/createMain.js");

const deleteMain = __webpack_require__(/*! ./deleteMain */ "./lib/deleteMain.js");

const rejectMain = __webpack_require__(/*! ./rejectMain */ "./lib/rejectMain.js");

const instanceMain = __webpack_require__(/*! ./instanceMain */ "./lib/instanceMain.js");

const groupMain = __webpack_require__(/*! ./groupMain */ "./lib/groupMain.js");

const metadataMain = __webpack_require__(/*! ./metadataMain */ "./lib/metadataMain.js");

const compressionOptionParser = __webpack_require__(/*! ./util/compressionOptionParser */ "./lib/util/compressionOptionParser.js");
/**
 * Defines the basic configuration values for the dicomwebserver component.  See the README for more details.
 * TODO - fix the default values so they come from the configuration file.  In the meantime, leave the defaults blank.
 */


const {
  mkdicomwebConfig
} = ConfigPoint.register({
  mkdicomwebConfig: {
    // This declare the inheritted configuration, don't assume this is directly accessible
    configBase: staticWadoConfig,
    isStudyData: true,
    isGroup: true,
    options: [{
      key: "-c, --clean",
      description: "Clean the outputs before generating/starting to write new values.",
      defaultValue: false
    }, {
      key: "-v, --verbose",
      description: "Write verbose output",
      defaultValue: false
    }, {
      key: "-t, --content-type <type>",
      description: 'Destination type to compress to (choices: "jls", "lei", "jls-lossy" or DICOM Transfer Syntax UID - default: "jls")',
      defaultValue: "jls",
      customParser: compressionOptionParser
    }, {
      key: "-m, --maximum-inline-public-length <value>",
      description: "Maximum length of public binary data",
      defaultValue: 128 * 1024 + 2
    }, {
      key: "-M, --maximum-inline-private-length <value>",
      description: "Maximum length of private binary data",
      defaultValue: 64
    }, {
      key: "-r, --recompress <listvalue...>",
      description: "List of types to recompress separated by space",
      defaultValue: ["uncompressed", "jp2"],
      choices: ["uncompressed", "jp2", "jpeglossless", "rle", "none"]
    }, {
      key: "--recompress-thumb <listvalue...>",
      description: "List of types to recompress thumb separated by space",
      defaultValue: ["uncompressed", "jp2"],
      choices: ["uncompressed", "jp2", "jpeglossless", "rle", "none"]
    }, {
      key: "--no-recompress",
      description: "Force no recompression",
      defaultValue: false
    }, {
      key: "--no-recompress-thumb",
      description: "Force no recompression thumbnail",
      defaultValue: false
    }, {
      key: "-T, --colour-content-type <value>",
      description: "Colour content type",
      defaultValue: null
    }, {
      key: "--path-deduplicated <path>",
      description: "Set the deduplicate data directory path (relative to dir)",
      defaultValue: "deduplicated"
    }, {
      key: "--path-instances <path>",
      description: "Set the instances directory path (relative to dir)",
      defaultValue: "instances"
    }, {
      key: "--store-multipart-bulk-data",
      description: "Use multipart encoding for non image frame bulkdata",
      defaultValue: false
    }, {
      key: "--prepend-bulk-data-uri <value>",
      description: "Prepend bulkdata uri (ex. to use absolute Uri like http://host:3000/dicomweb)",
      defaultValue: ""
    }, {
      key: "--expand-bulk-data-uri",
      description: "expand bulkdata relative uri to use full relative path (should also be set when using --prepend-bulk-data-uri)",
      defaultValue: false
    }, {
      key: "-o, --dir <value>",
      description: "Set output directory",
      defaultValue: {
        configOperation: "reference",
        source: "staticWadoConfig",
        reference: "rootDir"
      }
    }],
    programs: [{
      command: "create",
      isDefault: true,
      arguments: ["input"],
      main: createMain,
      helpDescription: "Make DICOMweb query and metadata from binary Part 10 DICOM files.  Does a full read of\n" + "deduplicated files each time a study instance UID is found, and only updates those studies\n" + "having at least one "
    }, {
      command: "instance",
      arguments: ["input"],
      main: instanceMain,
      helpDescription: "Make instance level DICOMweb metadata and bulkdata, but don't group or write series metadata"
    }, {
      command: "group",
      arguments: ["input"],
      main: groupMain,
      helpDescription: "Group instance level metadata into deduplicated data.\nDeletes instance level deduplicated information once it is confirmed written."
    }, {
      command: "metadata",
      arguments: ["input"],
      main: metadataMain,
      helpDescription: "Write the metadata object (series and study details) from the deduplicated data."
    }, {
      command: "delete",
      main: deleteMain,
      helpDescription: "Delete the given study, series or instance (not yet implemented)"
    }, {
      command: "reject",
      main: rejectMain,
      helpDescription: "Reject the specified series, specified as studies/<studyUID>/series/<seriesUID>"
    }]
  }
});
module.exports = mkdicomwebConfig;

/***/ }),

/***/ "./lib/model/TagLists.js":
/*!*******************************!*\
  !*** ./lib/model/TagLists.js ***!
  \*******************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const hashFactory = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'node-object-hash'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");
/* eslint "no-param-reassign": "off" */


const hasher = hashFactory();
const {
  PatientID,
  PatientName,
  IssuerOfPatientID
} = Tags;
const {
  StudyDescription,
  AccessionNumber,
  StudyInstanceUID,
  StudyDate,
  StudyTime
} = Tags;
const {
  SeriesDescription,
  SeriesNumber,
  SeriesInstanceUID,
  SeriesDate,
  SeriesTime
} = Tags;
const {
  DeduppedHash,
  DeduppedRef,
  DeduppedType
} = Tags;
const {
  pushList,
  getList,
  setValue,
  getValue
} = Tags;
const PatientQuery = [PatientID, Tags.OtherPatientIDsSequence, PatientName, IssuerOfPatientID, Tags.PatientBirthDate, Tags.PatientBirthTime, Tags.PatientSex, Tags.PatientIdentityRemoved, Tags.DeidentificationMethodCodeSequence];
const StudyQuery = [StudyDescription, AccessionNumber, StudyInstanceUID, StudyDate, StudyTime, Tags.StudyStatusID, Tags.StudyPriorityID, Tags.StudyID];
const PatientStudyQuery = [...PatientQuery, ...StudyQuery]; // The difference between the extracts and the query is that the query contains the parent query values
// TODO - make it into a self-cpontained object that can generate either

const SeriesExtract = [SeriesDescription, SeriesNumber, SeriesInstanceUID, Tags.Modality, SeriesDate, SeriesTime, Tags.SpecificCharacterSet, Tags.Manufacturer, Tags.InstitutionName, Tags.ReferringPhysicianName, Tags.StationName, Tags.OperatorsName, Tags.ManufacturerModelName, Tags.BodyPartExamined, Tags.ProtocolName, Tags.RequestedProcedureDescription];
const SeriesQuery = [StudyInstanceUID, ...SeriesExtract];
const InstanceQuery = [Tags.SOPInstanceUID, Tags.InstanceNumber, Tags.SeriesInstanceUID, Tags.StudyInstanceUID, Tags.ContentDate, Tags.ContentTime, Tags.AcquisitionDate, Tags.AcquisitionTime, Tags.AcquisitionNumber, Tags.SamplesPerPixel, Tags.PhotometricInterpretation, Tags.PlanarConfiguration, Tags.Rows, Tags.Columns, Tags.BitsAllocated, Tags.BitsStored, Tags.HighBit, Tags.PixelRepresentation, Tags.WindowCenter, Tags.WindowWidth, Tags.WindowCenterWidthExplanation, Tags.InstanceCreationTime];
const ImageExtract = [Tags.ImageType, Tags.InstanceCreationDate, Tags.SOPClassUID, Tags.ConversionType, Tags.ManufacturerModelName, Tags.ContentDate, Tags.AcquisitionDate, Tags.SecondaryCaptureDeviceID, Tags.DateOfSecondaryCapture, Tags.SecondaryCaptureDeviceManufacturer, Tags.SecondaryCaptureDeviceManufacturerModelName, Tags.SecondaryCaptureDeviceSoftwareVersions, Tags.SoftwareVersions, Tags.SamplesPerPixel, Tags.PhotometricInterpretation, Tags.PlanarConfiguration, Tags.Rows, Tags.Columns, Tags.BitsAllocated, Tags.BitsStored, Tags.HighBit, Tags.PixelRepresentation, Tags.WindowCenter, Tags.WindowWidth, Tags.WindowCenterWidthExplanation, Tags.PatientPosition, Tags.PatientOrientation];

const addHash = (data, type) => {
  const existing = getValue(data, DeduppedHash);

  if (existing) {
    return existing;
  }

  const hashValue = hasher.hash(data);
  setValue(data, DeduppedHash, hashValue);
  setValue(data, DeduppedType, type);
  return hashValue;
};

const TagSets = {
  PatientQuery,
  StudyQuery,
  PatientStudyQuery,
  SeriesQuery,
  SeriesExtract,
  InstanceQuery,
  ImageExtract,
  QueryExtract: {
    remove: false,
    hashRef: false
  },
  RemoveExtract: {
    remove: true,
    hashRef: true
  },
  extract: (data, type, tagSet, options) => {
    const ret = {};
    const {
      remove,
      hashRef
    } = options || {};
    tagSet.forEach(tag => {
      const value = data[tag];

      if (value) {
        ret[tag] = value;
        if (remove) delete data[tag];
      }
    });
    const hashValue = addHash(ret, type);

    if (hashRef) {
      pushList(data, DeduppedRef, hashValue);
    }

    return ret;
  },
  addHash
};
module.exports = TagSets;

/***/ }),

/***/ "./lib/model/uids.js":
/*!***************************!*\
  !*** ./lib/model/uids.js ***!
  \***************************/
/***/ ((module) => {

const octetStream = "application/octet-stream";
const uncompressed = {
  uncompressed: true,
  gzip: true,
  contentType: octetStream
};
/**
 * @see {@link https://dicom.nema.org/medical/dicom/current/output/chtml/part18/sect_8.7.3.3.2.html}
 */

const jpeg = "image/jpeg";
const jls = "image/jls";
const jll = "image/jll";
const jxl = "image/x-jxl";
const htj2k = "image/x-htj2k";
const jp2 = "image/jp2";
const rle = "image/dicom-rle";
const uids = {
  "1.2.840.10008.1.2": uncompressed,
  "1.2.840.10008.1.2.1": uncompressed,
  "1.2.840.10008.1.2.1.99": uncompressed,
  "1.2.840.10008.1.2.2": uncompressed,
  "1.2.840.10008.1.2.4.50": {
    contentType: jpeg,
    lossy: true
  },
  "1.2.840.10008.1.2.4.51": {
    contentType: jpeg,
    lossy: true
  },
  "1.2.840.10008.1.2.4.57": {
    contentType: jpeg
  },
  "1.2.840.10008.1.2.4.70": {
    contentType: jll
  },
  "1.2.840.10008.1.2.4.140": {
    contentType: jxl
  },
  "1.2.840.10008.1.2.4.141": {
    contentType: jxl,
    lossy: true
  },
  "1.2.840.10008.1.2.4.80": {
    contentType: jls
  },
  "1.2.840.10008.1.2.4.81": {
    contentType: jls,
    lossy: true
  },
  "1.2.840.10008.1.2.4.90": {
    contentType: jp2
  },
  "1.2.840.10008.1.2.4.91": {
    contentType: jp2
  },
  // From JPEG original data, lossless to JXL
  "1.2.840.10008.1.2.4.142": {
    contentType: jxl,
    lossy: true
  },
  "1.2.840.10008.1.2.4.150": {
    contentType: htj2k
  },
  // **
  "1.2.840.10008.1.2.5": {
    contentType: rle
  },
  default: {}
};
module.exports = uids;

/***/ }),

/***/ "./lib/operation/InstanceDeduplicate.js":
/*!**********************************************!*\
  !*** ./lib/operation/InstanceDeduplicate.js ***!
  \**********************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

// TODO review returning type of some methods
const JSONWriter = __webpack_require__(/*! ../writer/JSONWriter */ "./lib/writer/JSONWriter.js");

const TagLists = __webpack_require__(/*! ../model/TagLists */ "./lib/model/TagLists.js");

const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");

const {
  getValue,
  setValue
} = Tags;
const extractors = {
  patient: TagLists.PatientQuery,
  study: TagLists.StudyQuery,
  series: TagLists.SeriesExtract,
  image: TagLists.ImageExtract
};
/**
 * This is an instance listener - the way this one works is that it listens for instance metadata.
 * Every time an instance metadata event is fired, it deduplicates a bunch of data, firing deduplicate events,
 * and then collects the deduplicate data into a list.
 * Whenever the study UID changes, a new event is fired to indicate the deduplicated data is ready.
 */

async function deduplicateSingleInstance(id, imageFrame) {
  if (!imageFrame) return {};
  const studyData = await this.completeStudy.getCurrentStudyData(this, id);
  const seriesUID = getValue(imageFrame, Tags.SeriesInstanceUID);
  const sopUID = getValue(imageFrame, Tags.SOPInstanceUID);

  if (!sopUID) {
    console.warn("No sop instance UID in", imageFrame);
    return {};
  }

  if (studyData.sopExists(sopUID)) {
    if (this.verbose) console.log('SOP Instance UID', sopUID, 'already exists, skipping'); // TODO - allow replace as an option
    // Null value means skip writing this instance

    return null;
  }

  if (this.verbose) console.log('SOP Instance UID', sopUID, 'being added');
  const deduplicated = { ...imageFrame
  };
  if (!this.extractors) this.extractors = extractors;

  for (const key of Object.keys(this.extractors)) {
    const extracted = TagLists.extract(deduplicated, key, this.extractors[key], TagLists.RemoveExtract);
    const hashKey = getValue(extracted, Tags.DeduppedHash);
    await studyData.addExtracted(this, hashKey, extracted);
  } // Restore the series and SOP UIDs


  setValue(deduplicated, Tags.SeriesInstanceUID, seriesUID);
  setValue(deduplicated, Tags.SOPInstanceUID, sopUID);
  TagLists.addHash(deduplicated, Tags.InstanceType);
  return deduplicated;
}
/** Canonicalize the JSON data, making Values always arrays, remote "undefined" from the tags etc */


const canonicalize = json => {
  if (!json) return undefined;

  if (Array.isArray(json)) {
    return json.map(canonicalize);
  }

  Object.keys(json).forEach(tag => {
    if (!tag || tag === "undefined") {
      // console.error('Got an undefined tag:', tag, typeof(tag));
      // TODO check returning value
      return;
    }

    const val = json[tag];
    const {
      Value
    } = val || {};

    if (Value && !Array.isArray(Value)) {
      val.Value = [Value];
    }
  });
  return json;
};

const InstanceDeduplicate = options => async function run(id, sourceImageFrame) {
  // Notify the existing listeners, if any
  const imageFrame = canonicalize(sourceImageFrame);

  if (options.isInstanceMetadata) {
    // console.log("Writing instance metadata");
    await JSONWriter(id.sopInstanceRootPath, "metadata", imageFrame);
  }

  if (!options.isDeduplicate && !options.isGroup) {
    return;
  }

  if (!this.deduplicateSingleInstance) {
    this.deduplicateSingleInstance = deduplicateSingleInstance;
    this.verbose = options.verbose;
  }

  const deduppedInstance = await this.deduplicateSingleInstance(id, imageFrame);

  if (deduppedInstance) {
    // this refers to callee
    await this.deduplicated(id, deduppedInstance);
  }
};

module.exports = InstanceDeduplicate;

/***/ }),

/***/ "./lib/operation/ScanStudy.js":
/*!************************************!*\
  !*** ./lib/operation/ScanStudy.js ***!
  \************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const path = __webpack_require__(/*! path */ "path");

function ScanStudy(options) {
  const {
    directoryName,
    deduplicatedRoot,
    deduplicatedInstancesRoot
  } = options;
  return function run(dir, studyInstanceUid) {
    const studyPath = path.join(directoryName, "studies", studyInstanceUid);
    const deduplicatedPath = path.join(deduplicatedRoot, studyInstanceUid);
    const deduplicatedInstancesPath = path.join(deduplicatedInstancesRoot, studyInstanceUid);
    console.log("Scanning", dir, studyInstanceUid);
    return this.completeStudy.getCurrentStudyData(this, {
      studyPath,
      deduplicatedPath,
      deduplicatedInstancesPath,
      studyInstanceUid
    });
  };
}

module.exports = ScanStudy;

/***/ }),

/***/ "./lib/operation/StudyData.js":
/*!************************************!*\
  !*** ./lib/operation/StudyData.js ***!
  \************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const path = __webpack_require__(/*! path */ "path");

const fs = __webpack_require__(/*! fs */ "fs");

const hashFactory = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'node-object-hash'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const {
  JSONReader
} = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");

const TagLists = __webpack_require__(/*! ../model/TagLists */ "./lib/model/TagLists.js");

const JSONWriter = __webpack_require__(/*! ../writer/JSONWriter */ "./lib/writer/JSONWriter.js");

const {
  getValue,
  setValue,
  getList,
  setList
} = Tags;
const hasher = hashFactory();

const getSeriesInstanceUid = seriesInstance => getValue(seriesInstance, Tags.SeriesInstanceUID);
/**
 * StudyData contains information about the grouped study data.  It is used to create
 * study level information such as study or series level metadata, and to group things
 * together during processing, such as handling the study level deduplicated group
 * files.
 *
 * It also has methods on performing study level operations such as patient name updates
 * or instance remove operations, and has methods to handle avoiding needing to store instance
 * level data multiple times when it already exists.
 */


class StudyData {
  constructor({
    studyInstanceUid,
    studyPath,
    deduplicatedPath,
    deduplicatedInstancesPath
  }, {
    isGroup,
    clean
  }) {
    this.studyInstanceUid = studyInstanceUid;
    this.studyPath = studyPath;
    this.isGroup = isGroup;
    this.deduplicatedPath = deduplicatedPath;
    this.deduplicatedInstancesPath = deduplicatedInstancesPath;
    this.clean = clean;
    this.clear();
  }

  clear() {
    this.deduplicated = [];
    this.extractData = {}; // The list of already existing files read in to create this object

    this.existingFiles = []; // The read hashes is the hashes of the files that are read, both as groups and internally

    this.readHashes = {}; // The deduplicated hashes are just the hashes for individual items

    this.deduplicatedHashes = {};
    this.sopInstances = {}; // Used to track if new instances have been added.

    this.newInstancesAdded = 0;
  }
  /**
   * Clean the directory, and/or read existing data in the isInstances or isGroup files.
   * TODO - implement this.
   */


  async init({
    clean
  }) {
    if (clean) {// Wipe out the study directory entirely, as well as the deduplicatedRoot and instancesRoot
    }

    if (this.deduplicatedPath) {
      await this.readDeduplicated(this.deduplicatedPath);
    }

    if (this.deduplicatedInstancesPath) {
      await this.readDeduplicated(this.deduplicatedInstancesPath);
    }
  }

  get numberOfInstances() {
    return this.deduplicated.length;
  }
  /**
   * Indicate if this study is 'dirty', that is, has been updated.
   * That is NOT to say that the metadata files generated from this study data are up to date, that is
   * a separate type of check.
   */


  get dirty() {
    return this.newInstancesAdded > 0 || this.existingFiles.length > 1;
  }

  async dirtyMetadata() {
    if (this.dirty) {
      // console.log("Study data is dirty - need to write updated file");
      return true;
    }

    try {
      const deduplicatedTopFile = await JSONReader(this.studyPath, "deduplicated.gz", null);

      if (!deduplicatedTopFile) {
        return true;
      }

      const info = deduplicatedTopFile[0];

      if (!info || getValue(info, Tags.DeduppedHash) || getValue(info, Tags.DeduppedType) != "info") {
        return true;
      }

      const hashValue = getValue(info, Tags.DeduppedHash);
      return this.existingFiles[0].indexOf(hashValue) == -1;
    } catch (e) {
      console.log("Assume study metadata is dirty", e);
      return true;
    }
  }

  async reject(seriesInstanceUid, sopInstanceUid, reason) {
    console.log("Rejecting series instance UID", seriesInstanceUid, "because", reason); // TODO - actually add a reject note...

    this.newInstancesAdded += 1;

    for (let i = 0; i < this.deduplicated.length; i++) {
      const recombined = await this.recombine(i);
      const reSeriesUid = getValue(recombined, Tags.SeriesInstanceUID);
      if (reSeriesUid !== seriesInstanceUid) continue;
      const reSop = getValue(recombined, Tags.SOPInstanceUID);
      if (!reSop) continue;
      if (reSop !== sopInstanceUid) continue;
      setValue(this.deduplicated[i], Tags.DeduppedType, "deleted");
    }
  }

  async delete() {
    await fs.rmSync(this.studyPath, {
      recursive: true,
      force: true
    });
    await fs.rmSync(this.deduplicatedInstancesPath, {
      recursive: true,
      force: true
    });
    await fs.rmSync(this.deduplicatedPath, {
      recursive: true,
      force: true
    });
    this.clear();
  }

  async getOrLoadExtract(hashKey) {
    let item = this.extractData[hashKey];

    if (!item) {
      item = await JSONReader.readHashData(this.studyPath, hashKey);

      if (!item) {
        console.error("Unable to read hashdata", hashKey);
        return item;
      }

      this.extractData[hashKey] = item;
    }

    return item;
  }

  assignUndefined(ret, item) {
    if (!item) return;
    Object.keys(item).forEach(key => {
      if (ret[key]) return;
      ret[key] = item[key];
    });
  }
  /**
   * Create a full study instance data for instance at index
   */


  async recombine(index) {
    const deduplicated = this.deduplicated[index];

    if (index < 0 || index >= this.deduplicated.length) {
      throw new Error(`Can't read index ${index}, out of bounds [0..${this.deduplicated.length})`);
    }

    const refs = getList(deduplicated, Tags.DeduppedRef);

    if (!refs) {
      console.log("No refs for", deduplicated);
      return deduplicated;
    }

    const ret = { ...deduplicated
    };

    for (const hashKey of refs) {
      const item = await this.getOrLoadExtract(hashKey);
      this.assignUndefined(ret, item);
    }

    return ret;
  }

  async addExtracted(callback, hashKey, item) {
    if (this.extractData[hashKey]) {
      if (this.verbose) console.log("Already have extracted", hashKey, getValue(item, Tags.DeduppedType));
      return;
    }

    await callback.bulkdata(this, hashKey, item);
    this.extractData[hashKey] = item;
  }

  sopExists(sopUID) {
    const sopValue = sopUID && sopUID.Value && sopUID.Value[0] || sopUID;
    return sopValue && this.sopInstances[sopValue] !== undefined;
  }

  addDeduplicated(data, filename) {
    if (!this.isGroup) return; // TODO - check the hash code on the added data, if it has already been seen then ignore this item.

    if (this.internalAddDeduplicated(data, filename)) {
      this.newInstancesAdded += 1;
    }
  }
  /** Add the instance if not already present */


  internalAddDeduplicated(data, filename = "internal") {
    const hashValue = TagLists.addHash(data, Tags.InstanceType);

    if (!hashValue || this.deduplicatedHashes[hashValue]) {
      // console.log('Not adding', hashValue, 'because the hash exists');
      return false;
    }

    const sopValue = getValue(data, Tags.SOPInstanceUID);
    const sopIndex = this.sopInstances[sopValue];

    if (!sopValue) {
      console.warn("No sop value in", filename, "reading", data);
      return false;
    }

    this.deduplicatedHashes[hashValue] = data;
    this.readHashes[hashValue] = filename;

    if (sopIndex !== undefined) {
      console.log("Replacing SOP", sopValue, "at index", sopIndex);
      this.deduplicated[sopIndex] = data;
    } else {
      this.sopInstances[sopValue] = this.deduplicated.length;
      this.deduplicated.push(data);
    }

    return !!hashValue;
  }

  async listJsonFiles(dir) {
    const names = await fs.promises.readdir(dir);
    if (!names || names.length == 0) return [];
    const gzNames = names.filter(name => name.indexOf(".gz") > 0);
    const statInfo = gzNames.map(name => {
      const stat = fs.statSync(path.join(dir, name));
      return { ...stat,
        name,
        hash: this.removeGz(name)
      };
    }).sort((a, b) => b.mtimeMs - a.mtimeMs);
    return statInfo;
  }
  /**
   * Reads the deduplicated directory, finding the newest file in the directory of type JSON,
   * and then reads it in.  It then reads in all un-referenced files, and adds references to those to the
   * current path, NOT changing the hash value of the top level element.
   *
   * Records the files read in referencedFiles list.
   * Sets the dirty deduplicated flag if at least two instances were read.
   *
   * Does NOT call the readInstances, which is a separate step which can be executed after this one.
   *
   * @param {*} deduplicatedDirectory
   */


  async readDeduplicated(deduplicatedDirectory) {
    try {
      const files = await this.listJsonFiles(deduplicatedDirectory);

      if (!files || !files.length) {
        console.log("No deduplicated for", deduplicatedDirectory);
        return;
      }

      console.log("There are", files.length, "files to check");

      for (let i = 0; i < files.length; i++) {
        const stat = files[i];
        const {
          hash
        } = stat;

        if (this.readHashes[hash]) {
          continue;
        }

        await this.readDeduplicatedFile(deduplicatedDirectory, stat);
      }

      console.log("Done checking", deduplicatedDirectory);
    } catch (e) {// No-op console.log(e);
    }
  }

  async readDeduplicatedFile(dir, stat) {
    const {
      hash,
      name
    } = stat;

    try {
      if (this.verbose) console.log("Reading deduplicated file", name);
      const data = await JSONReader(dir, name);
      this.readHashes[hash] = name;
      this.existingFiles.push(name);
      const listData = Array.isArray(data) && data || [data];
      listData.forEach(item => {
        const type = getValue(item, Tags.DeduppedType);

        if (type == Tags.InstanceType) {
          this.internalAddDeduplicated(item, name);
        } else if (type == "info") {
          const refs = getList(item, Tags.DeduppedRef);

          if (refs) {
            refs.forEach(hashValue => {
              this.readHashes[hashValue] = `${hashValue}.gz`;
            });
          }
        } else {
          const hashValue = getValue(item, Tags.DeduppedHash);

          if (hashValue) {
            this.extractData[hashValue] = item;
          }
        }
      });
    } catch (e) {
      console.error("Unable to read", dir, name);
    }
  }

  async writeMetadata() {
    const anInstance = await this.recombine(0);
    const series = {};

    for (let i = 0; i < this.numberOfInstances; i++) {
      const seriesInstance = await this.recombine(i);
      const type = getValue(seriesInstance, Tags.DeduppedType);

      if (type == "deleted") {
        console.log("Skipping", type);
        continue;
      }

      const seriesInstanceUid = getSeriesInstanceUid(seriesInstance);

      if (!seriesInstanceUid) {
        console.log("Cant get seriesUid from", Tags.SeriesInstanceUID, seriesInstance);
        continue;
      }

      if (!series[seriesInstanceUid]) {
        const seriesQuery = TagLists.extract(seriesInstance, "series", TagLists.SeriesQuery);
        const seriesPath = path.join(this.studyPath, "series", seriesInstanceUid);
        series[seriesInstanceUid] = {
          seriesPath,
          seriesQuery,
          instances: [],
          instancesQuery: []
        };
      }

      series[seriesInstanceUid].instances.push(seriesInstance);
      series[seriesInstanceUid].instancesQuery.push(TagLists.extract(seriesInstance, "instance", TagLists.InstanceQuery));
    }

    const seriesList = [];
    const modalitiesInStudy = [];
    let numberOfInstances = 0;
    let numberOfSeries = 0;

    for (const seriesUid of Object.keys(series)) {
      const singleSeries = series[seriesUid];
      const {
        seriesQuery,
        seriesPath,
        instances,
        instancesQuery
      } = singleSeries;
      seriesQuery[Tags.NumberOfSeriesRelatedInstances] = {
        vr: "IS",
        Value: [instances.length]
      };
      numberOfInstances += instances.length;
      numberOfSeries += 1;
      seriesList.push(seriesQuery);
      const modality = getValue(seriesQuery, Tags.Modality);
      if (modalitiesInStudy.indexOf(modality) == -1) modalitiesInStudy.push(modality);
      await JSONWriter(seriesPath, "metadata", instances, {
        gzip: true,
        index: false
      });
      await JSONWriter(seriesPath, "series", [seriesQuery]);
      await JSONWriter(seriesPath, "instances", instancesQuery);
    }

    await JSONWriter(this.studyPath, "series", seriesList);
    console.log("Wrote series with", seriesList.length);
    const studyQuery = TagLists.extract(anInstance, "study", TagLists.PatientStudyQuery);
    studyQuery[Tags.ModalitiesInStudy] = {
      Value: modalitiesInStudy,
      vr: "CS"
    };
    studyQuery[Tags.NumberOfStudyRelatedInstances] = {
      Value: [numberOfInstances],
      vr: "IS"
    };
    studyQuery[Tags.NumberOfStudyRelatedSeries] = {
      Value: [numberOfSeries],
      vr: "IS"
    }; // Write the index.json directly in the studyPath directory.

    await JSONWriter(this.studyPath, "index.json", [studyQuery], {
      gzip: true,
      index: false
    });
    const infoItem = this.createInfo();
    console.log("Writing deduplicated study data with", Object.values(this.extractData).length, "extract items and", this.deduplicated.length, "instance items");
    await JSONWriter(this.studyPath, "deduplicated", [infoItem, ...Object.values(this.extractData), ...this.deduplicated]);
    return studyQuery;
  }
  /**
   * Creates an information item containing the hash value of this item type.
   */


  createInfo() {
    const data = {};
    const hashValue = hasher.hash(this.deduplicated);
    setValue(data, Tags.DeduppedHash, hashValue);
    setValue(data, Tags.DeduppedType, "info");
    return data;
  }
  /* eslint-disable-next-line class-methods-use-this */


  removeGz(name) {
    const gzIndex = name.indexOf(".gz");
    return gzIndex > 0 && name.substring(0, gzIndex) || name;
  }
  /** Writes the deduplicated group */


  async writeDeduplicatedGroup() {
    const data = this.createInfo();
    const hashValue = getValue(data, Tags.DeduppedHash);
    console.log("Writing deduplicated hash data set data with", Object.values(this.extractData).length, "extract items and", this.deduplicated.length, "instance items");
    setList(data, Tags.DeduppedRef, Object.keys(this.readHashes).filter(() => this.deduplicatedHashes[hashValue] == undefined));
    const deduplicatedList = [data, ...Object.values(this.extractData), ...this.deduplicated]; // const naturalList = deduplicatedList.map(Tags.naturalizeDataset);
    // // console.log("naturalList=", JSON.stringify(naturalList,null,2));
    // console.log("Going to write study data", naturalList.length);
    // await JSONWriter(this.deduplicatedPath, hashValue, naturalList, { gzip: true, index: false });

    await JSONWriter(this.deduplicatedPath, hashValue, deduplicatedList, {
      gzip: true,
      index: false
    });
    console.log("Wrote naturalized dataset");
  }

}

module.exports = StudyData;

/***/ }),

/***/ "./lib/operation/ThumbnailService.js":
/*!*******************************************!*\
  !*** ./lib/operation/ThumbnailService.js ***!
  \*******************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const path = __webpack_require__(/*! path */ "path");

const glob = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'glob'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const dicomCodec = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@cornerstonejs/dicom-codec'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const staticCS = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-cs-lite'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const fs = __webpack_require__(/*! fs */ "fs");

const {
  exec
} = __webpack_require__(/*! child_process */ "child_process");

const decodeImage = __webpack_require__(/*! ./adapter/decodeImage */ "./lib/operation/adapter/decodeImage.js");

const {
  shouldThumbUseTranscoded
} = __webpack_require__(/*! ./adapter/transcodeImage */ "./lib/operation/adapter/transcodeImage.js");

const {
  isVideo
} = __webpack_require__(/*! ../writer/VideoWriter */ "./lib/writer/VideoWriter.js");

const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");
/**
 * Return the middle index of given list
 * @param {*} listThumbs
 * @returns
 */


function getThumbIndex(listThumbs) {
  return Math.trunc(listThumbs / 2);
}

function internalGenerateThumbnail(originalImageFrame, dataset, metadata, transferSyntaxUid, doneCallback) {
  decodeImage(originalImageFrame, dataset, transferSyntaxUid).then((decodeResult = {}) => {
    if (isVideo(transferSyntaxUid)) {
      console.log("Video data - no thumbnail generator yet");
    } else {
      const {
        imageFrame,
        imageInfo
      } = decodeResult;
      const pixelData = dicomCodec.getPixelData(imageFrame, imageInfo, transferSyntaxUid);
      staticCS.getRenderedBuffer(transferSyntaxUid, pixelData, metadata, doneCallback);
    }
  }).catch(error => {
    console.log(`Error while generating thumbnail:: ${error}`);
  });
}
/**
 * ThumbObj wrapper containing both original and transcoded content.
 *
 * @typedef {Object} ThumbObjWrapper
 * @property {Object} id object containing study properties such as seriesUid, instanceUid
 * @property {*} transcodedId transcoded object containing study properties such as seriesUid, instanceUid (this might be the same as original id depending on options)
 * @property {*} imageFrame original image frame
 * @property {*} transcodedImageFrame transcoded image frame (this might be the same as original frame depending on options)
 * @property {number} frameIndex
 */

/**
 * ThumbObj containing imageFrame, id to be used.
 *
 * @typedef {Object} ThumbObj
 * @property {Object} id object containing study properties such as seriesUid, instanceUid
 * @property {*} imageFrame
 * @property {number} frameIndex
 */

/**
 * Service to handle thumbnail creation.
 * @class
 * @constructor
 * @property {Array<ThumbObj>} framesThumbnailObj Auxiliary list that contains all thumb obj.
 * @property {ThumbObj} favoriteThumbnailObj Favorite thumb obj to be used on thumbnail creation
 * @property {String} thumbFileName thumb file (with extension) to be used when creating the file.
 * @public
 */


class ThumbnailService {
  constructor() {
    this.framesThumbnailObj = [];
    this.favoriteThumbnailObj = {};
    this.thumbFileName = "thumbnail";
  }
  /**
   * Add thumbObj to list of possible thumbs.
   * It might use original content or transcoded depending on options flags
   * @param {ThumbObjWrapper} thumbObjWrapper
   * @param {Object} programOpts
   */


  queueThumbnail(thumbObjWrapper, programOpts) {
    const {
      id,
      imageFrame,
      transcodedId,
      transcodedImageFrame,
      frameIndex
    } = thumbObjWrapper;

    const getThumbContent = (originalContent, trancodedContent) => shouldThumbUseTranscoded(id, programOpts) ? trancodedContent : originalContent;

    const thumbObj = {
      imageFrame: getThumbContent(imageFrame, transcodedImageFrame),
      id: getThumbContent(id, transcodedId),
      frameIndex
    };
    this.framesThumbnailObj.push(thumbObj);
    this.setFavoriteThumbnailObj();
  }

  setFavoriteThumbnailObj() {
    const favIndex = getThumbIndex(this.framesThumbnailObj.length);
    this.favoriteThumbnailObj = this.framesThumbnailObj[favIndex];
  }

  ffmpeg(input, output) {
    exec(`ffmpeg -i "${input}" -vf  "thumbnail,scale=640:360" -frames:v 1 -f singlejpeg "${output}"`, (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        return;
      }

      if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
      }

      console.log(`stdout: ${stdout}`);
    });
  }
  /**
   * Generates thumbnails for the levels: instances, series, study
   *
   * @param {*} dataSet
   * @param {*} metadata
   * @param {*} callback
   */


  generateThumbnails(itemId, dataSet, metadata, callback) {
    const {
      imageFrame,
      id
    } = this.favoriteThumbnailObj; // There are various reasons no thumbnails might be generated, so just return

    if (!id) {
      const pixelData = metadata[Tags.PixelData];

      if (pixelData) {
        const {
          BulkDataURI
        } = pixelData;

        if (BulkDataURI?.indexOf("mp4")) {
          const mp4Path = path.join(itemId.sopInstanceRootPath, "pixeldata.mp4");
          const thumbPath = path.join(itemId.sopInstanceRootPath, "thumbnail");
          console.log("MP4 - converting video format", mp4Path);
          this.ffmpeg(mp4Path, thumbPath);
        } else {
          console.log("pixelData = ", pixelData, Tags.PixelData);
        }
      } else {
        console.log("Series is of other type...", metadata[Tags.Modality]);
      }

      return;
    }

    internalGenerateThumbnail(imageFrame, dataSet, metadata, id.transferSyntaxUid, async thumbBuffer => {
      if (thumbBuffer) {
        await callback.thumbWriter(id.sopInstanceRootPath, this.thumbFileName, thumbBuffer);
        this.copySyncThumbnail(id.sopInstanceRootPath, id.seriesRootPath);
        this.copySyncThumbnail(id.seriesRootPath, id.studyPath);
      }
    });
  }
  /**
   * Copy thumbnail from sourceFolder to targetFolderPath. It usually is used to copy from child to parent folder.
   * If there is already some existing thumbnails under targetFolderPath it actually get thumb on the index defined by getThumbIndex.
   * Copy is a syncrhonous process.
   *
   * @param {*} sourceFolderPath
   * @param {*} targetFolderPath
   * @returns
   */


  async copySyncThumbnail(sourceFolderPath, targetFolderPath) {
    const parentPathLevel = path.join(sourceFolderPath, "../");
    const thumbFilesPath = glob.sync(`${parentPathLevel}*/${this.thumbFileName}`);
    const thumbIndex = getThumbIndex(thumbFilesPath.length);
    const thumbFilePath = thumbFilesPath[thumbIndex];

    if (!fs.existsSync(thumbFilePath)) {
      console.log("Thumbnail to copy does not exists");
      return;
    }

    try {
      if (!fs.lstatSync(targetFolderPath).isDirectory()) {
        throw new Error(`Target path: ${targetFolderPath} is not a directory`);
      }

      fs.copyFileSync(thumbFilePath, `${targetFolderPath}/${this.thumbFileName}`);
    } catch (e) {
      console.log("The file could not be copied", e);
    }
  }

}

module.exports = ThumbnailService;

/***/ }),

/***/ "./lib/operation/adapter/asyncIterableToBuffer.js":
/*!********************************************************!*\
  !*** ./lib/operation/adapter/asyncIterableToBuffer.js ***!
  \********************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
  Stats
} = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
/* eslint "no-param-reassign": "off" */


const handler = {
  get(obj, key) {
    const ikey = parseInt(key);
    if (ikey == key) return obj.index_get(ikey);
    const handlerFunc = handler[key];
    if (handlerFunc && key != "get") return handlerFunc(obj, key);

    if (!obj._keys[key]) {
      console.log("New call to", key);
      obj._keys[key] = true;
    }

    return obj[key];
  },

  length: obj => obj.combinedLength
};
const StreamingFunctions = {
  addChunks(chunks) {
    if (!this.chunks) this.chunks = [];
    chunks.forEach(chunk => this.chunks.push(chunk));
    this.combinedLength = 0;
    let i = 0;
    this.chunks.forEach(chunk => {
      chunk.start = this.combinedLength;
      chunk.i = i;
      i += 1;
      this.combinedLength += chunk.length;
    });
    this.lastChunk = this.chunks[0];
  },

  index_get(ikey) {
    const found = this.findChunk(ikey);
    if (!found) throw Error(`index ${ikey} not found between 0..${this.combinedLength}`);
    return found[ikey - found.start];
  },

  findChunk(ikey) {
    let i = this.lastChunk.start <= ikey && this.lastChunk.i || 0;

    while (i < this.chunks.length) {
      const chunk = this.chunks[i];

      if (ikey >= chunk.start && ikey < chunk.start + chunk.length) {
        this.lastChunk = chunk;
        return chunk;
      }

      i += 1;
    }

    return undefined;
  },

  slice(start, end) {
    const buflen = end - start;
    const ret = Buffer.alloc(buflen);
    let i = 0;

    while (i < buflen) {
      const chunk = this.findChunk(start + i);
      const chunkI = start + i - chunk.start;
      const useLen = Math.min(buflen, chunk.length - chunkI);
      chunk.copy(ret, i, chunkI, chunkI + useLen);
      i += useLen;
    }

    return ret;
  },

  hexSlice(start, end) {
    return this.slice(start, end).hexSlice();
  },

  /** The internal node copy function is a native that directly accesses internal class details, so over-ride it.
   * TODO: Make this efficient by using the internal copy function when available rather than copy one at a time.
   */
  copy(target, targetStart = 0, srcStart = 0, srcEnd = 0) {
    const {
      length
    } = target;
    const srcLength = srcEnd === undefined && Math.min(this.length, srcEnd) || this.length;
    const copied = 0;

    while (targetStart < length && srcStart < srcLength) {
      target[targetStart] = this[srcStart];
      targetStart += 1;
      srcStart += 1;
    }

    return copied;
  },

  _keys: {
    then: true,
    lastChunk: true,
    chunks: true
  }
};
Object.keys(StreamingFunctions).forEach(key => {
  StreamingFunctions._keys[key] = true;
});

const StreamingBuffer = chunks => {
  const buf = Buffer.from("NotUsed");
  Object.assign(buf, StreamingFunctions);
  buf.addChunks(chunks);
  return new Proxy(buf, handler);
};

const asyncIteratorToBuffer = async readable => {
  if (ArrayBuffer.isView(readable)) return readable;
  const chunks = [];

  for await (const chunk of readable) {
    chunks.push(chunk);
    Stats.BufferStats.add("Read Async", `Read async buffer ${chunks.length}`, 1024);
  }

  Stats.BufferStats.reset();
  return StreamingBuffer(chunks);
};

module.exports = asyncIteratorToBuffer;

/***/ }),

/***/ "./lib/operation/adapter/decodeImage.js":
/*!**********************************************!*\
  !*** ./lib/operation/adapter/decodeImage.js ***!
  \**********************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const dicomCodec = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@cornerstonejs/dicom-codec'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const getImageInfo = __webpack_require__(/*! ./getImageInfo */ "./lib/operation/adapter/getImageInfo.js");

async function decodeImage(imageFrame, dataset, transferSyntaxUid) {
  const imageInfo = getImageInfo(dataset);
  return dicomCodec.decode(imageFrame, imageInfo, transferSyntaxUid);
}

module.exports = decodeImage;

/***/ }),

/***/ "./lib/operation/adapter/getImageInfo.js":
/*!***********************************************!*\
  !*** ./lib/operation/adapter/getImageInfo.js ***!
  \***********************************************/
/***/ ((module) => {

/**
 * Minimum image info data to be used on transcode process by dicom-codec api.
 */
function getImageInfo(dataSet) {
  const rows = dataSet.uint16("x00280010");
  const columns = dataSet.uint16("x00280011");
  const bitsAllocated = dataSet.uint16("x00280100");
  const samplesPerPixel = dataSet.uint16("x00280002");
  const pixelRepresentation = dataSet.uint16("x00280103") || 0; // not yet being used.

  return {
    bitsAllocated,
    samplesPerPixel,
    rows,
    // Number with the image rows/height
    columns,
    // Number with the image columns/width,
    signed: pixelRepresentation === 1,
    pixelRepresentation
  };
}

module.exports = getImageInfo;

/***/ }),

/***/ "./lib/operation/adapter/transcodeImage.js":
/*!*************************************************!*\
  !*** ./lib/operation/adapter/transcodeImage.js ***!
  \*************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

const dicomCodec = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@cornerstonejs/dicom-codec'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const Tags = __webpack_require__(/*! ../../dictionary/Tags */ "./lib/dictionary/Tags.js");

const getImageInfo = __webpack_require__(/*! ./getImageInfo */ "./lib/operation/adapter/getImageInfo.js");

const transcodeOp = {
  none: 0,
  decode: 1,
  encode: 2,
  transcode: 3 // decode and then encode

};
/**
 * Static mapping for transcoding decoder destination names/uids - currently only lei, jls and jls-lossy appear to work.
 */

const transcodeDestinationMap = {
  lei: {
    transferSyntaxUid: "1.2.840.10008.1.2.1",
    transcodeOp: transcodeOp.none
  },
  jls: {
    transferSyntaxUid: "1.2.840.10008.1.2.4.80",
    transcodeOp: transcodeOp.encode
  },
  "jls-lossy": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.81",
    transcodeOp: transcodeOp.encode
  },
  jp2: {
    transferSyntaxUid: "1.2.840.10008.1.2.4.90",
    transcodeOp: transcodeOp.encode
  },
  "jp2-lossy": {
    transferSyntaxUid: "1.2.840.10008.1.2.4.91",
    transcodeOp: transcodeOp.encode
  }
};
const transcodeSourceMap = {
  "1.2.840.10008.1.2": {
    transcodeOp: transcodeOp.decode,
    alias: "uncompressed"
  },
  "1.2.840.10008.1.2.1": {
    transcodeOp: transcodeOp.none,
    alias: "uncompressed"
  },
  "1.2.840.10008.1.2.2": {
    transcodeOp: transcodeOp.decode,
    alias: "uncompressed"
  },
  "1.2.840.10008.1.2.4.57": {
    transcodeOp: transcodeOp.decode,
    alias: "jpeglossless"
  },
  "1.2.840.10008.1.2.4.70": {
    transcodeOp: transcodeOp.decode,
    alias: "jpeglossless"
  },
  "1.2.840.10008.1.2.4.90": {
    transcodeOp: transcodeOp.decode,
    alias: "jp2"
  },
  "1.2.840.10008.1.2.4.91": {
    transcodeOp: transcodeOp.decode,
    alias: "jp2"
  },
  "1.2.840.10008.1.2.5": {
    transcodeOp: transcodeOp.decode,
    alias: "rle"
  }
};
/**
 * Get an existing destination transcoder from destination map. 
 *
 * @param {*} id Destination type to compress to 
 * @returns A partial transcoder definition. Otherwise it returns undefined.
 */

function getDestinationTranscoder(id) {
  const destinationTranscoderEntry = Object.entries(transcodeDestinationMap).find(([key, value]) => key === id || value.transferSyntaxUid === id);

  if (destinationTranscoderEntry) {
    return destinationTranscoderEntry[1];
  }

  return undefined;
}
/**
 * Return a merged source and destination transcoder for the given transferSyntaxUid. Otherwise it returns undefined.
 *
 * @param {*} transferSyntaxUid
 * @returns
 */


function getTranscoder(transferSyntaxUid, {
  contentType,
  verbose
}) {
  if (verbose) {
    console.log(`getTranscoder for ${transferSyntaxUid}`);
  }

  const sourceTranscoder = transcodeSourceMap[transferSyntaxUid];
  const destinationTranscoder = getDestinationTranscoder(contentType);

  if (!sourceTranscoder || !destinationTranscoder) {
    return undefined;
  }

  return {
    transferSyntaxUid: destinationTranscoder.transferSyntaxUid,
    transcodeOp: sourceTranscoder.transcodeOp | destinationTranscoder.transcodeOp,
    // eslint-disable-line no-bitwise
    alias: sourceTranscoder.alias
  };
}
/**
 * Tell whether given id contain transferSyntaxUid which can be transcoded or not.
 * @param {*} id object containing transferSyntaxUid
 * @param {*} options runner options
 */


function shouldTranscodeImageFrame(id, options) {
  if (!options.recompress) {
    return false;
  }

  function isValidTranscoder() {
    const {
      transferSyntaxUid
    } = id;
    const transcoder = getTranscoder(transferSyntaxUid, options);
    return transcoder && transcoder.transferSyntaxUid && options.recompress.includes(transcoder.alias);
  }

  return isValidTranscoder();
}
/**
 * It tells if we should use transcoded image to generate thumb or not.
 *
 * @param {*} id
 * @param {*} options
 * @returns True if transcoder.alias is present on intersection of recompressThumb and recompress options.
 */


function shouldThumbUseTranscoded(id, options) {
  if (!options.recompressThumb) {
    return false;
  }

  function isValidTranscoder() {
    const {
      transferSyntaxUid
    } = id;
    const transcoder = getTranscoder(transferSyntaxUid, options);
    const result = transcoder && transcoder.transferSyntaxUid && options.recompress.includes(transcoder.alias) && options.recompressThumb.includes(transcoder.alias);
    return result;
  }

  return isValidTranscoder();
}

function transcodeLog(options, msg, error = "") {
  if (options.verbose) {
    console.log(`\x1b[34m${msg}\x1b[0m`, error);
  }
}
/**
 * Transcode imageFrame. It uses transcodeMap to define the target encoding based on source encoding.
 *
 * @param {*} id object containing transferSyntaxUid
 * @param {*} targetId target object containing transferSyntaxUid
 * @param {*} imageFrame data to be transcoded
 * @param {*} dataSet related image frame dataset
 * @param {*} options runner options
 * @returns object result for transcoding operation with id and image frame.
 */


async function transcodeImageFrame(id, targetIdSrc, imageFrame, dataSet, options = {}) {
  let targetId = targetIdSrc;
  let result = {};

  if (!shouldTranscodeImageFrame(id, options)) {
    return {
      id,
      imageFrame,
      done: false
    };
  }

  const transcoder = getTranscoder(id.transferSyntaxUid, options); // last chance to prevent transcoding

  if (targetId.transferSyntaxUid !== transcoder.transferSyntaxUid) {
    return {
      id,
      imageFrame,
      done: false
    };
  }

  if (options.verbose) {
    console.log("Transcoding to", transcoder.transferSyntaxUid);
  }

  const imageInfo = getImageInfo(dataSet);
  let done = false;
  let processResultMsg = "";

  try {
    switch (transcoder.transcodeOp) {
      case transcodeOp.transcode:
        transcodeLog(options, `Full transcoding image from \x1b[43m${id.transferSyntaxUid}\x1b[0m to \x1b[43m${targetId.transferSyntaxUid}\x1b[0m`);
        result = await dicomCodec.transcode(imageFrame, imageInfo, id.transferSyntaxUid, targetId.transferSyntaxUid);
        processResultMsg = `Transcoding finished`;
        break;

      case transcodeOp.encode:
        transcodeLog(options, `Encoding image to \x1b[43m${targetId.transferSyntaxUid}\x1b[0m`);
        result = await dicomCodec.encode(imageFrame, imageInfo, targetId.transferSyntaxUid);
        processResultMsg = `Encoding finished`;
        break;

      case transcodeOp.decode:
        transcodeLog(options, `Decoding image from \x1b[43m${id.transferSyntaxUid}\x1b[0m`);
        result = await dicomCodec.decode(imageFrame, imageInfo, id.transferSyntaxUid);
        processResultMsg = `Decoding finished`;
        break;

      default:
        processResultMsg = "";
    }

    done = !!result.imageFrame;
  } catch (e) {
    transcodeLog(options, "Failed to transcode image", e);
  } // recover transfer syntax


  if (!done) {
    targetId = id;
  } // log final message only if resultMsg is present


  if (processResultMsg) {
    processResultMsg += done ? " successfully" : " unsuccessfully";
    transcodeLog(options, processResultMsg);
  }

  const _imageFrame = result.imageFrame ?? imageFrame;

  return {
    id: targetId,
    imageFrame: _imageFrame,
    done
  };
}
/**
 * Returns transcoded id object based on the given id's transferSyntaxUid. If transcoding should not occur it will return original id value.
 * It does not mutate id param.
 *
 * @param {*} id Object that contains (but not only) data transferSyntaxUid.
 * @param {*} options runner options.
 * @returns Transcoded id object
 */


function transcodeId(id, options) {
  if (!shouldTranscodeImageFrame(id, options)) {
    return id;
  }

  const targetId = { ...id
  };
  const {
    transferSyntaxUid
  } = getTranscoder(id.transferSyntaxUid, options);
  targetId.transferSyntaxUid = transferSyntaxUid;
  return targetId;
}
/**
 * Returns transcoded metadata based on the given id's transferSyntaxUid.
 * Basically it changes the metadata AvailableTransferSyntaxUID tag's value to be transcodedId.transferSyntaxUid
 * If transcoding should not occur it will return original metadata value.
 *
 * It does not mutate metadata param.
 * @param {*} metadata Metadata object.
 * @param {*} id Object that contains (but not only) data transferSyntaxUid.
 * @param {*} options runner options.
 * @returns Transcoded metadata.
 */


function transcodeMetadata(metadata, id, options) {
  if (!shouldTranscodeImageFrame(id, options)) {
    return metadata;
  }

  const transcodedId = transcodeId(id, options);
  const result = { ...metadata
  };

  if (result[Tags.AvailableTransferSyntaxUID]) {
    Tags.setValue(result, Tags.AvailableTransferSyntaxUID, transcodedId.transferSyntaxUid);
  }

  return result;
}

exports.shouldTranscodeImageFrame = shouldTranscodeImageFrame;
exports.shouldThumbUseTranscoded = shouldThumbUseTranscoded;
exports.transcodeId = transcodeId;
exports.getDestinationTranscoder = getDestinationTranscoder;
exports.transcodeImageFrame = transcodeImageFrame;
exports.transcodeMetadata = transcodeMetadata;

/***/ }),

/***/ "./lib/operation/extractImageFrames.js":
/*!*********************************************!*\
  !*** ./lib/operation/extractImageFrames.js ***!
  \*********************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const getNumberOfFrames = __webpack_require__(/*! ./getNumberOfFrames */ "./lib/operation/getNumberOfFrames.js");

const getUncompressedImageFrame = __webpack_require__(/*! ./getUncompressedImageFrame */ "./lib/operation/getUncompressedImageFrame.js");

const getEncapsulatedImageFrame = __webpack_require__(/*! ./getEncapsulatedImageFrame */ "./lib/operation/getEncapsulatedImageFrame.js");

const {
  isVideo
} = __webpack_require__(/*! ../writer/VideoWriter */ "./lib/writer/VideoWriter.js");

const areFramesAreFragmented = (attr, numberOfFrames) => attr.encapsulatedPixelData && numberOfFrames != attr.fragments.length;

const getFrameSize = dataSet => {
  const rows = dataSet.uint16("x00280010");
  const columns = dataSet.uint16("x00280011");
  const samplesPerPixel = dataSet.uint16("x00280002");
  const bitsAllocated = dataSet.uint16("x00280100");
  return rows * columns * samplesPerPixel * bitsAllocated / 8;
};

const extractImageFrames = async (dataSet, attr, vr, callback) => {
  const numberOfFrames = getNumberOfFrames(dataSet);
  const framesAreFragmented = areFramesAreFragmented(attr, numberOfFrames);
  const uncompressedFrameSize = getFrameSize(dataSet);
  const videoType = isVideo(dataSet);

  if (videoType) {
    // The top level function is asynchronous, so this one doesn't need an additional await
    return callback.videoWriter(dataSet);
  }

  let BulkDataURI;

  for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
    if (attr.encapsulatedPixelData) {
      const compressedFrame = getEncapsulatedImageFrame(dataSet, attr, frameIndex, framesAreFragmented);
      BulkDataURI = await callback.imageFrame(compressedFrame, {
        dataSet
      });
    } else {
      const uncompressedFrame = getUncompressedImageFrame(dataSet, attr, frameIndex, uncompressedFrameSize);
      BulkDataURI = await callback.imageFrame(uncompressedFrame, {
        dataSet
      });
    }
  }

  return BulkDataURI;
};

module.exports = extractImageFrames;

/***/ }),

/***/ "./lib/operation/getDataSet.js":
/*!*************************************!*\
  !*** ./lib/operation/getDataSet.js ***!
  \*************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const getVR = __webpack_require__(/*! ./getVR */ "./lib/operation/getVR.js");

const getValue = __webpack_require__(/*! ./getValue */ "./lib/operation/getValue.js");

const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");
/**
 * Get dataset.
 *
 * ParentAttr is used to control root/non-root attr scenarios (such as pixel data).
 *
 * @param {*} dataSet
 * @param {*} callback
 * @param {*} options
 * @param {*} parentAttr Parent reference for sequence element tags.
 * @returns
 */


async function getDataSet(dataSet, callback, options, parentAttr = undefined) {
  const metadata = {}; // iterate over dataSet attributes in order

  for (const tag in dataSet.elements) {
    // Raw versions have the x in front of them
    if (tag != Tags.RawTransferSyntaxUID && tag >= Tags.RawMinTag && tag < Tags.RawFirstBodyTag) {
      continue;
    }

    const attr = dataSet.elements[tag];
    /* eslint-disable-next-line no-use-before-define */

    await attributeToJS(metadata, tag, dataSet, attr, callback, options, parentAttr);
  }

  if (metadata[Tags.TransferSyntaxUID]) {
    // console.log(`Found tsuid ${JSON.stringify(metadata[Tags.TransferSyntaxUID])} assigning to ${Tags.AvailableTransferSyntaxUID}`)
    metadata[Tags.AvailableTransferSyntaxUID] = metadata[Tags.TransferSyntaxUID];
    delete metadata[Tags.TransferSyntaxUID];
  }

  return {
    metadata
  };
}

async function attributeToJS(metadataSrc, tag, dataSet, attr, callback, options, parentAttr) {
  const metadata = metadataSrc;
  const vr = getVR(attr);
  const value = await getValue(dataSet, attr, vr, getDataSet, callback, options, parentAttr);
  const key = tag.substring(1).toUpperCase();

  if (value === undefined || value === null || value.length === 0) {
    if (!vr) return;
    metadata[key] = {
      vr
    };
  } else if (value.InlineBinary || value.BulkDataURI) {
    metadata[key] = {
      vr,
      ...value
    };
  } else {
    metadata[key] = {
      vr,
      Value: value
    };
  }
}

module.exports = getDataSet;

/***/ }),

/***/ "./lib/operation/getEncapsulatedImageFrame.js":
/*!****************************************************!*\
  !*** ./lib/operation/getEncapsulatedImageFrame.js ***!
  \****************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const dicomParser = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'dicom-parser'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */


const getEncapsulatedImageFrame = (dataSet, attr, frameIndex, framesAreFragmented) => {
  if (dataSet.elements.x7fe00010 && dataSet.elements.x7fe00010.basicOffsetTable.length) {
    // Basic Offset Table is not empty
    return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frameIndex);
  } // Empty basic offset table


  if (framesAreFragmented) {
    const basicOffsetTable = dicomParser.createJPEGBasicOffsetTable(dataSet, dataSet.elements.x7fe00010);
    return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frameIndex, basicOffsetTable);
  }

  return dicomParser.readEncapsulatedPixelDataFromFragments(dataSet, dataSet.elements.x7fe00010, frameIndex);
};

module.exports = getEncapsulatedImageFrame;

/***/ }),

/***/ "./lib/operation/getNumberOfFrames.js":
/*!********************************************!*\
  !*** ./lib/operation/getNumberOfFrames.js ***!
  \********************************************/
/***/ ((module) => {

const getNumberOfFrames = dataSet => {
  if (dataSet.elements.x00280008) {
    const numberOfFramesString = dataSet.string("x00280008");

    if (numberOfFramesString.length === 0) {
      return 1;
    }

    const numberOfFrames = parseInt(numberOfFramesString);
    return numberOfFrames;
  }

  return 1;
};

module.exports = getNumberOfFrames;

/***/ }),

/***/ "./lib/operation/getUncompressedImageFrame.js":
/*!****************************************************!*\
  !*** ./lib/operation/getUncompressedImageFrame.js ***!
  \****************************************************/
/***/ ((module) => {

function getUncompressedImageFrame(dataSet, attr, frame, uncompressedFrameSize) {
  const start = attr.dataOffset + frame * uncompressedFrameSize;
  const binaryValue = dataSet.byteArray.slice(start, start + uncompressedFrameSize);
  return binaryValue;
}

module.exports = getUncompressedImageFrame;

/***/ }),

/***/ "./lib/operation/getVR.js":
/*!********************************!*\
  !*** ./lib/operation/getVR.js ***!
  \********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const dataDictionary = __webpack_require__(/*! ../dictionary/dataDictionary */ "./lib/dictionary/dataDictionary.js");

const getVR = attr => {
  if (attr.vr) {
    return attr.vr;
  } // lookup the vr using the data dictionary


  const tag = attr.tag.substring(1).toUpperCase();
  const dataDictAttr = dataDictionary[tag];

  if (dataDictAttr) {
    return dataDictAttr.vr;
  }

  return undefined;
};

module.exports = getVR;

/***/ }),

/***/ "./lib/operation/getValue.js":
/*!***********************************!*\
  !*** ./lib/operation/getValue.js ***!
  \***********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const extractImageFrames = __webpack_require__(/*! ./extractImageFrames */ "./lib/operation/extractImageFrames.js");

const getValueInlineString = (dataSet, attr) => [dataSet.string(attr.tag)];

const getStrings = (dataSet, attr) => {
  const ret = dataSet.string(attr.tag);
  return ret && ret.split(/\\/) || undefined;
};

const getValuePatientName = (dataSet, attr) => {
  const strings = getStrings(dataSet, attr);
  return strings && strings.map(item => ({
    Alphabetic: item
  })) || undefined;
};
/** Gets either InlineBinary or BulkDataURI, if already defined */


const getValueInlineBinary = (dataSet, attr) => {
  if (attr.BulkDataURI) return {
    BulkDataURI: attr.BulkDataURI
  };
  const binaryValue = dataSet.byteArray.slice(attr.dataOffset, attr.dataOffset + attr.length);
  return {
    InlineBinary: binaryValue.toString("base64")
  };
};

const getValueInlineSignedShort = (dataSet, attr) => {
  if (attr.length > 2) {
    return getValueInlineBinary(dataSet, attr);
  }

  return [dataSet.int16(attr.tag)];
};

const getValueInlineUnsignedShort = (dataSet, attr) => {
  const ret = [];

  for (let i = 0; i < attr.length / 2; i++) {
    ret.push(dataSet.uint16(attr.tag, i));
  }

  return ret;
};

const getValueInlineSignedLong = (dataSet, attr) => {
  if (attr.length > 4) {
    return getValueInlineBinary(dataSet, attr);
  }

  return [dataSet.int32(attr.tag)];
};

const getValueInlineUnsignedLong = (dataSet, attr) => {
  if (attr.length > 4) {
    return getValueInlineBinary(dataSet, attr);
  }

  return [dataSet.uint32(attr.tag)];
};

const getValueInlineFloat = (dataSet, attr) => {
  if (attr.length > 65536 * 4) {
    return getValueInlineBinary(dataSet, attr);
  }

  const ret = [];

  for (let i = 0; i < attr.length / 4; i++) {
    ret.push(dataSet.float(attr.tag, i));
  }

  return ret;
};

const getValueInlineIntString = (dataSet, attr) => getStrings(dataSet, attr).map(val => parseInt(val));

const getValueInlineFloatString = (dataSet, attr) => getStrings(dataSet, attr).map(val => parseFloat(val));

const getValueInlineFloatDouble = (dataSet, attr) => {
  if (attr.length > 8) {
    return getValueInlineBinary(dataSet, attr);
  }

  return [dataSet.double(attr.tag)];
};

const getValueInlineAttributeTag = (dataSet, attr) => {
  const group = dataSet.uint16(attr.tag, 0);
  const groupHexStr = `0000${group.toString(16)}`.substr(-4);
  const element = dataSet.uint16(attr.tag, 1);
  const elementHexStr = `0000${element.toString(16)}`.substr(-4);
  return groupHexStr + elementHexStr;
};

const getValueInline = (dataSet, attr, vr) => {
  if (attr.length == 0) {
    return [];
  }

  switch (vr) {
    case "AE":
    case "AS":
      return getValueInlineString(dataSet, attr);

    case "AT":
      return getValueInlineAttributeTag(dataSet, attr);

    case "DS":
      return getValueInlineFloatString(dataSet, attr);

    case "CS":
    case "DA":
    case "DT":
      return getValueInlineString(dataSet, attr);

    case "FL":
      return getValueInlineFloat(dataSet, attr);

    case "FD":
      return getValueInlineFloatDouble(dataSet, attr);

    case "IS":
      return getValueInlineIntString(dataSet, attr);

    case "LO":
    case "LT":
      return getValueInlineString(dataSet, attr);

    case "OB":
    case "OF":
    case "OW":
      return getValueInlineBinary(dataSet, attr);

    case "PN":
      return getValuePatientName(dataSet, attr);

    case "SH":
      return getValueInlineString(dataSet, attr);

    case "SL":
      return getValueInlineSignedLong(dataSet, attr);

    case "SS":
      return getValueInlineSignedShort(dataSet, attr);

    case "ST":
    case "TM":
    case "UI":
      return getValueInlineString(dataSet, attr);

    case "UL":
      return getValueInlineUnsignedLong(dataSet, attr);

    case "UN":
      return getValueInlineBinary(dataSet, attr);

    case "US":
      return getValueInlineUnsignedShort(dataSet, attr);

    case "UT":
      return getValueInlineString(dataSet, attr);

    default:
      return getValueInlineBinary(dataSet, attr);
  }
};

const isPrivate = attr => {
  const {
    tag
  } = attr;
  const ch = tag.substr(4, 1);
  const chHex = parseInt(ch, 16);
  return chHex % 2 == 1;
};

const isValueInline = (attr, options) => {
  if (isPrivate(attr)) {
    return attr.length <= options.maximumInlinePrivateLength;
  }

  return !attr.length || attr.length <= options.maximumInlinePublicLength;
};
/**
 * Get data value for the given attr.
 * Attr can be a pixelData tag, sequence items, inline or bulkdata
 *
 * @param {*} dataSet
 * @param {*} attr
 * @param {*} vr
 * @param {*} getDataSet
 * @param {*} callback
 * @param {*} options object containing program properties.
 * @param {*} parentAttr attr's parent. If not present means attr is at root level.
 * @returns
 */


const getValue = async (dataSet, attr, vr, getDataSet, callback, options, parentAttr) => {
  // It will only process pixelData tag if on metadata root. Otherwise it will be skiped.
  if (attr.tag === "x7fe00010" && !parentAttr) {
    const BulkDataURI = await extractImageFrames(dataSet, attr, vr, callback, options);
    return {
      BulkDataURI
    };
  }

  if (attr.tag === "xfffee00d") return undefined; // Group length

  if (attr.tag.length == 9 && attr.tag.substring(5, 9) === "0000") return undefined;

  if (attr.items) {
    // sequences
    const result = [];

    for (const item of attr.items) {
      const subResult = await getDataSet(item.dataSet, callback, options, attr);
      if (subResult.metadata) result.push(subResult.metadata);
    }

    return result;
  }

  if (attr.Value) {
    return Array.isArray(attr.Value) && attr.Value || [attr.Value];
  } // non sequence item


  if (isValueInline(attr, options)) {
    return getValueInline(dataSet, attr, vr);
  }

  const binaryValue = dataSet.byteArray.slice(attr.dataOffset, attr.dataOffset + attr.length);
  const mimeType = attr.tag == "x00420011" && dataSet.string("x00420012");
  const BulkDataURI = await callback.bulkdata(binaryValue, {
    mimeType
  });
  return {
    BulkDataURI,
    vr
  };
};

module.exports = getValue;

/***/ }),

/***/ "./lib/rejectMain.js":
/*!***************************!*\
  !*** ./lib/rejectMain.js ***!
  \***************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const StaticWado = __webpack_require__(/*! ./StaticWado */ "./lib/StaticWado.ts");

const adaptProgramOpts = __webpack_require__(/*! ./util/adaptProgramOpts */ "./lib/util/adaptProgramOpts.js");

module.exports = function rejectMain(options, program) {
  const finalOptions = adaptProgramOpts(options, { ...this,
    isGroup: true,
    isStudyData: true
  });
  const importer = new StaticWado(finalOptions);
  return importer.reject(program.args);
};

/***/ }),

/***/ "./lib/util/IdCreator.js":
/*!*******************************!*\
  !*** ./lib/util/IdCreator.js ***!
  \*******************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const path = __webpack_require__(/*! path */ "path");

function IdCreator({
  directoryName,
  deduplicatedRoot,
  deduplicatedInstancesRoot
}) {
  return (uids, filename) => {
    const studyPath = path.join(directoryName, "studies", uids.studyInstanceUid);
    const seriesRootPath = path.join(studyPath, "series", uids.seriesInstanceUid);
    const sopInstanceRootPath = path.join(studyPath, "series", uids.seriesInstanceUid, "instances", uids.sopInstanceUid);
    const deduplicatedPath = path.join(deduplicatedRoot, uids.studyInstanceUid);
    const deduplicatedInstancesPath = path.join(deduplicatedInstancesRoot, uids.studyInstanceUid);
    const imageFrameRootPath = path.join(sopInstanceRootPath, "frames");
    return { ...uids,
      studyPath,
      deduplicatedPath,
      deduplicatedInstancesPath,
      seriesRootPath,
      sopInstanceRootPath,
      imageFrameRootPath,
      filename
    };
  };
}

module.exports = IdCreator;

/***/ }),

/***/ "./lib/util/adaptProgramOpts.js":
/*!**************************************!*\
  !*** ./lib/util/adaptProgramOpts.js ***!
  \**************************************/
/***/ ((module) => {

const assignDefined = (dest, src) => {
  Object.keys(src).forEach(key => {
    const val = src[key];

    if (val !== undefined) {
      dest[key] = val;
    }
  });
  return dest;
};

module.exports = function adaptProgramOpts(programOpts, defaults) {
  const {
    maximumInlinePublicLength,
    maximumInlinePrivateLength,
    group: isGroup,
    instances: isInstanceMetadata,
    deduplicate: isDeduplicate,
    study: isStudyData,
    clean: isClean,
    recompress,
    recompressThumb,
    contentType,
    colourContentType,
    dir: rootDir,
    pathDeduplicated,
    pathInstances,
    removeDeduplicatedInstances,
    storeMultipartBulkData,
    prependBulkDataUri,
    expandBulkDataUri,
    verbose
  } = programOpts;
  return assignDefined({ ...defaults
  }, {
    maximumInlinePublicLength,
    maximumInlinePrivateLength,
    isGroup,
    isInstanceMetadata,
    isDeduplicate,
    isStudyData,
    isClean,
    recompress,
    recompressThumb,
    contentType,
    colourContentType,
    rootDir,
    pathDeduplicated,
    pathInstances,
    removeDeduplicatedInstances,
    storeMultipartBulkData,
    prependBulkDataUri,
    expandBulkDataUri,
    verbose
  });
};

/***/ }),

/***/ "./lib/util/compressionOptionParser.js":
/*!*********************************************!*\
  !*** ./lib/util/compressionOptionParser.js ***!
  \*********************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
  program
} = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const {
  getDestinationTranscoder
} = __webpack_require__(/*! ../operation/adapter/transcodeImage */ "./lib/operation/adapter/transcodeImage.js");

module.exports = function compressionOptionParser(value) {
  const destination = getDestinationTranscoder(value);

  if (destination) {
    console.log("Found destination transferSyntax ", destination.transferSyntaxUid, "for ", value);
  } else {
    console.log("No transcoder destination for ", value);
    throw new program.InvalidArgumentError(`No transcoder destination for ${value}`);
  }

  return destination.transferSyntaxUid;
};

/***/ }),

/***/ "./lib/writer/CompleteStudyWriter.js":
/*!*******************************************!*\
  !*** ./lib/writer/CompleteStudyWriter.js ***!
  \*******************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
  Stats
} = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const {
  JSONReader
} = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const JSONWriter = __webpack_require__(/*! ./JSONWriter */ "./lib/writer/JSONWriter.js");

const StudyData = __webpack_require__(/*! ../operation/StudyData */ "./lib/operation/StudyData.js");

const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");
/**
 * CompleteStudyWriter takes the deduplicated data values, all loaded into the study parameter,
 * and writes it out as various dataset types.  The options parameters define what types it gets
 * written out as.
 * The studyData object is then removed, so that a new one can be created if required.
 */


const CompleteStudyWriter = options => {
  async function ret() {
    const {
      studyData
    } = this;
    if (!studyData) return;

    if (!studyData.numberOfInstances) {
      console.log("studyData.deduplicated is empty");
      delete this.studyData;
      return;
    }

    if (options.isGroup) {
      if (studyData.dirty) {
        await studyData.writeDeduplicatedGroup();
        console.log("Wrote updated deduplicated data for study", studyData.studyInstanceUid);
      } else {
        console.log("Not writing new deduplicated data because it is clean:", studyData.studyInstanceUid);
      }
    }

    if (!options.isStudyData) {
      delete this.studyData;
      Stats.StudyStats.summarize();
      return;
    }

    const isDirtyMetadata = await studyData.dirtyMetadata();

    if (!isDirtyMetadata) {
      console.log("Study metadata", studyData.studyInstanceUid, "has clean metadata, not writing");
      delete this.studyData;
      Stats.StudyStats.summarize(`Study metadata ${studyData.studyInstanceUid} has clean metadata, not writing`);
      return;
    }

    const studyQuery = await studyData.writeMetadata();
    const allStudies = await JSONReader(options.directoryName, "studies/index.json.gz", []);
    const studyUID = Tags.getValue(studyQuery, Tags.StudyInstanceUID);

    if (!studyUID) {
      console.error("studyQuery=", studyQuery);
      throw new Error("Study query has null studyUID");
    }

    const studyIndex = allStudies.findIndex(item => Tags.getValue(item, Tags.StudyInstanceUID) == studyUID);

    if (studyIndex == -1) {
      allStudies.push(studyQuery);
    } else {
      allStudies[studyIndex] = studyQuery;
    }

    await JSONWriter(options.directoryName, "studies", allStudies);
    delete this.studyData;
    Stats.StudyStats.summarize(`Wrote study metadata/query files for ${studyData.studyInstanceUid}`);
  }
  /**
   * Gets a current study data object, or completes the old one and generates a new one.
   * async call as it may need to store the current study data value.
   */


  ret.getCurrentStudyData = async (callback, id) => {
    const {
      studyData
    } = callback;
    const {
      studyInstanceUid
    } = id;

    if (studyData) {
      if (studyData.studyInstanceUid == studyInstanceUid) {
        return studyData;
      }

      await callback.completeStudy(studyData);
    }

    callback.setStudyData(new StudyData(id, options));
    await callback.studyData.init(options);
    return callback.studyData;
  };

  return ret;
};

module.exports = CompleteStudyWriter;

/***/ }),

/***/ "./lib/writer/DeduplicateWriter.js":
/*!*****************************************!*\
  !*** ./lib/writer/DeduplicateWriter.js ***!
  \*****************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const hashFactory = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'node-object-hash'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const hasher = hashFactory();

const JSONWriter = __webpack_require__(/*! ./JSONWriter */ "./lib/writer/JSONWriter.js");

const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");

const TagLists = __webpack_require__(/*! ../model/TagLists */ "./lib/model/TagLists.js");

async function writeDeduplicatedFile(dir, data, hashValueSrc) {
  const hashValue = hashValueSrc || hasher.hash(data); // Write it direct in the deduplicated directory, not as a sub-directory or index file

  await JSONWriter(dir, hashValue, data, {
    gzip: true,
    index: false
  });
  return hashValue;
}

const perInstanceWriter = async (id, data) => {
  const {
    deduplicatedInstancesPath
  } = id;
  const hashValue = TagLists.addHash(data, Tags.InstanceType);
  return writeDeduplicatedFile(deduplicatedInstancesPath, [data], hashValue);
};
/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */


const DeduplicateWriter = options => async function DeduplicateWriterInstance(id, data) {
  const studyData = await this.completeStudy.getCurrentStudyData(this, id);

  if (options.isDeduplicate) {
    await perInstanceWriter(id, data);
  }

  studyData.addDeduplicated(data, id.filename);
};

module.exports = DeduplicateWriter;

/***/ }),

/***/ "./lib/writer/ExpandUriPath.js":
/*!*************************************!*\
  !*** ./lib/writer/ExpandUriPath.js ***!
  \*************************************/
/***/ ((module) => {

const ExpandUriPath = (id, path, options) => {
  const {
    prependBulkDataUri,
    expandBulkDataUri,
    includeSeries
  } = options;
  let expandedRelative = "";

  if (expandBulkDataUri) {
    let expandedRelativeSeries = "";

    if (includeSeries) {
      expandedRelativeSeries = `series/${id.seriesInstanceUid}/`;
    }

    expandedRelative = `studies/${id.studyInstanceUid}/${expandedRelativeSeries}`;
  }

  if (options.verbose) console.log(`Expanded path returned: ${prependBulkDataUri}${expandedRelative}${path}`);
  return `${prependBulkDataUri}${expandedRelative}${path}`;
};

module.exports = ExpandUriPath;

/***/ }),

/***/ "./lib/writer/HashDataWriter.js":
/*!**************************************!*\
  !*** ./lib/writer/HashDataWriter.js ***!
  \**************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const hashFactory = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'node-object-hash'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const hasher = hashFactory();

const path = __webpack_require__(/*! path */ "path");

const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");

const WriteStream = __webpack_require__(/*! ./WriteStream */ "./lib/writer/WriteStream.js");

const WriteMultipart = __webpack_require__(/*! ./WriteMultipart */ "./lib/writer/WriteMultipart.js");

const ExpandUriPath = __webpack_require__(/*! ./ExpandUriPath */ "./lib/writer/ExpandUriPath.js");

const {
  MultipartHeader
} = __webpack_require__(/*! ./MultipartHeader */ "./lib/writer/MultipartHeader.js"); // Extensions for encapsulated content.  Do NOT add any executable content extensions here.


const extensions = {
  "application/pdf": ".pdf",
  "text/json": ".json",
  "application/xml+cda": ".cda.xml"
};
/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */

const HashDataWriter = options => async (id, key, data, additionalOptions = {}) => {
  const isRaw = ArrayBuffer.isView(data);
  const {
    storeMultipartBulkData
  } = options;
  const {
    mimeType
  } = additionalOptions; // If the file has an extension, it should be directly accessible as that file type.

  const gzip = !isRaw || data.length > 1024 && !mimeType;
  const {
    dirName,
    fileName
  } = HashDataWriter.createHashPath(data, options);
  const absolutePath = path.join(id.studyPath, dirName);
  const rawData = isRaw ? data : JSON.stringify(data, null, 1);
  const writeStream = WriteStream(absolutePath, fileName, {
    mkdir: true,
    gzip
  });

  if (isRaw && storeMultipartBulkData) {
    await WriteMultipart(writeStream, [new MultipartHeader("Content-Type", "application/octet-stream")], rawData);
  } else {
    await writeStream.write(rawData);
  }

  await writeStream.close();
  return ExpandUriPath(id, `${dirName}/${fileName}`, options);
};
/**
 * Returns a hash path relative to the objectUID directory.
 */


HashDataWriter.createHashPath = (data, options = {}) => {
  const {
    mimeType
  } = options;
  const isRaw = ArrayBuffer.isView(data);
  const extension = isRaw ? mimeType && extensions[mimeType] || "" : ".json";
  const hashValue = Tags.getValue(data, Tags.DeduppedHash) || hasher.hash(data);
  return {
    // Use string concat as this value is used for the BulkDataURI which needs forward slashes
    dirName: `bulkdata/${hashValue.substring(0, 3)}/${hashValue.substring(3, 5)}`,
    fileName: hashValue.substring(5) + extension
  };
};

module.exports = HashDataWriter;

/***/ }),

/***/ "./lib/writer/ImageFrameWriter.js":
/*!****************************************!*\
  !*** ./lib/writer/ImageFrameWriter.js ***!
  \****************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const uids = __webpack_require__(/*! ../model/uids */ "./lib/model/uids.js");

const WriteStream = __webpack_require__(/*! ./WriteStream */ "./lib/writer/WriteStream.js");

const WriteMultipart = __webpack_require__(/*! ./WriteMultipart */ "./lib/writer/WriteMultipart.js");

const ExpandUriPath = __webpack_require__(/*! ./ExpandUriPath */ "./lib/writer/ExpandUriPath.js");

const {
  MultipartHeader,
  MultipartAttribute
} = __webpack_require__(/*! ./MultipartHeader */ "./lib/writer/MultipartHeader.js");

const ImageFrameWriter = options => {
  const {
    verbose
  } = options;
  return async (id, index, imageFrame) => {
    const {
      transferSyntaxUid
    } = id;
    const type = uids[transferSyntaxUid] || uids.default;
    const writeStream = WriteStream(id.imageFrameRootPath, `${1 + index}`, {
      gzip: type.gzip,
      mkdir: true
    });
    let content;

    if (imageFrame instanceof Uint8Array) {
      content = imageFrame;
    } else {
      content = Buffer.from(imageFrame.buffer);
    }

    await WriteMultipart(writeStream, [new MultipartHeader("Content-Type", type.contentType, [new MultipartAttribute("transfer-syntax", transferSyntaxUid)])], content);
    await writeStream.close();
    if (verbose) console.log("Wrote image frame", id.sopInstanceUid, index + 1);
    const includeSeries = true;
    return ExpandUriPath(id, `instances/${id.sopInstanceUid}/frames`, {
      includeSeries,
      ...options
    });
  };
};

module.exports = ImageFrameWriter;

/***/ }),

/***/ "./lib/writer/JSONWriter.js":
/*!**********************************!*\
  !*** ./lib/writer/JSONWriter.js ***!
  \**********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
  Stats
} = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

const path = __webpack_require__(/*! path */ "path");

const WriteStream = __webpack_require__(/*! ./WriteStream */ "./lib/writer/WriteStream.js");
/** Writes out JSON files to the given file name.  Automatically GZips them, and adds the extension */


const JSONWriter = async (dir, name, data, options = {
  gzip: true,
  brotli: false,
  index: true
}) => {
  const fileName = options.index ? "index.json.gz" : name + (options.gzip && ".gz" || options.brotli && ".br" || "");
  const dirName = options.index ? path.join(dir, name) : dir;
  const writeStream = WriteStream(dirName, fileName, { ...options,
    mkdir: true
  });
  await writeStream.write(JSON.stringify(data));
  await writeStream.close();
  Stats.StudyStats.add("Write JSON", `Write JSON file ${name}`, 1000);
};

module.exports = JSONWriter;

/***/ }),

/***/ "./lib/writer/MultipartAttribute.js":
/*!******************************************!*\
  !*** ./lib/writer/MultipartAttribute.js ***!
  \******************************************/
/***/ ((module) => {

class MultipartAttribute {
  constructor(attributeName, attributeValue) {
    this.attributeName = attributeName;
    this.attributeValue = attributeValue;
  }

}

module.exports = MultipartAttribute;

/***/ }),

/***/ "./lib/writer/MultipartHeader.js":
/*!***************************************!*\
  !*** ./lib/writer/MultipartHeader.js ***!
  \***************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const MultipartAttribute = __webpack_require__(/*! ./MultipartAttribute */ "./lib/writer/MultipartAttribute.js");

class MultipartHeader {
  constructor(headerName, headerValue, attributes = []) {
    this.headerName = headerName;
    this.headerValue = headerValue;
    this.attributes = attributes;
  }

}

module.exports = {
  MultipartAttribute,
  MultipartHeader
};

/***/ }),

/***/ "./lib/writer/ThumbnailWriter.js":
/*!***************************************!*\
  !*** ./lib/writer/ThumbnailWriter.js ***!
  \***************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const WriteStream = __webpack_require__(/*! ./WriteStream */ "./lib/writer/WriteStream.js");

const ThumbnailWriter = options => {
  const {
    verbose
  } = options;
  return async (filePath, fileName, thumbBuffer) => {
    const writeStream = WriteStream(filePath, fileName, {
      mkdir: true
    });
    await writeStream.write(thumbBuffer);
    await writeStream.close();

    if (verbose) {
      console.log("Wrote thumbnail frame", filePath, fileName);
    }
  };
};

module.exports = ThumbnailWriter;

/***/ }),

/***/ "./lib/writer/VideoWriter.js":
/*!***********************************!*\
  !*** ./lib/writer/VideoWriter.js ***!
  \***********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

/** Write raw video file */
const Tags = __webpack_require__(/*! ../dictionary/Tags */ "./lib/dictionary/Tags.js");

const WriteStream = __webpack_require__(/*! ./WriteStream */ "./lib/writer/WriteStream.js");

const MPEG2 = "mpg";
const H264 = "mp4";
const H265 = "h265";
const VIDEO_TYPES = {
  "1.2.840.10008.1.2.4.100": MPEG2,
  "1.2.840.10008.1.2.4.101": MPEG2,
  "1.2.840.10008.1.2.4.102": H264,
  "1.2.840.10008.1.2.4.103": H264,
  "1.2.840.10008.1.2.4.104": H264,
  "1.2.840.10008.1.2.4.105": H264,
  "1.2.840.10008.1.2.4.106": H264,
  "1.2.840.10008.1.2.4.107": H265,
  "1.2.840.10008.1.2.4.108": H265 // TODO - add the new multi-segment MPEG2 and H264 variants

};

const isVideo = value => VIDEO_TYPES[value && value.string ? value.string(Tags.RawTransferSyntaxUID) : value];

const VideoWriter = () => async function run(id, dataSet) {
  console.log(`Writing video  ${id.sopInstanceUid}`);
  const extension = VIDEO_TYPES[dataSet.string(Tags.RawTransferSyntaxUID)];
  const filename = `pixeldata.${extension}`;
  const writeStream = WriteStream(id.sopInstanceRootPath, filename, {
    mkdir: true
  });
  let length = 0;
  const {
    fragments
  } = dataSet.elements.x7fe00010;

  if (!fragments) {
    console.warn("No video data");
    return "";
  } // The zero position fragment isn't available, even though present in the original data


  for (let i = 0; i < fragments.length; i++) {
    const fragment = fragments[i];
    const blob = dataSet.byteArray.slice(fragment.position, fragment.position + fragment.length);
    length += blob.length;
    await writeStream.write(blob);
  }

  await writeStream.close();
  console.log(`Done video ${id.sopInstanceRootPath}\\${filename} of length ${length}`);
  return `series/${id.seriesInstanceUid}/instances/${id.sopInstanceUid}/pixeldata.${extension}?length=${length}&offset=0`;
};

module.exports = VideoWriter;
VideoWriter.isVideo = isVideo;

/***/ }),

/***/ "./lib/writer/WriteMultipart.js":
/*!**************************************!*\
  !*** ./lib/writer/WriteMultipart.js ***!
  \**************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const {
  v4: uuid
} = __webpack_require__(/*! uuid */ "./node_modules/uuid/dist/esm-node/index.js");

const WriteMultipart = async (writeStream, headers, content) => {
  const boundaryId = uuid();
  await writeStream.write(`--BOUNDARY_${boundaryId}\r\n`);

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    await writeStream.write(`${header.headerName}: ${header.headerValue}`);

    if (header.attributes) {
      for (let j = 0; j < header.attributes.length; j++) {
        const attribute = header.attributes[j];
        await writeStream.write(`;${attribute.attributeName}=${attribute.attributeValue}`);
      }
    }

    await writeStream.write("\r\n");
  }

  await writeStream.write("\r\n");
  await writeStream.write(content);
  await writeStream.write(`\r\n--BOUNDARY_${boundaryId}--`);
};

module.exports = WriteMultipart;

/***/ }),

/***/ "./lib/writer/WriteStream.js":
/*!***********************************!*\
  !*** ./lib/writer/WriteStream.js ***!
  \***********************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const fs = __webpack_require__(/*! fs */ "fs");

const zlib = __webpack_require__(/*! zlib */ "zlib");

const path = __webpack_require__(/*! path */ "path");
/** Create an optionally gzipped stream,
 * where the write operations are performed in order executed,
 * and don't require synchronization, only the 'close' operation
 * requires syncing.
 */


const WriteStream = (dir, nameSrc, options = {}) => {
  const isGzip = nameSrc.indexOf(".gz") != -1 || options.gzip;
  const name = isGzip && nameSrc.indexOf(".gz") === -1 && `${nameSrc}.gz` || nameSrc;
  if (options.mkdir) fs.mkdirSync(dir, {
    recursive: true
  });
  const tempName = path.join(dir, `tempFile-${Math.round(Math.random() * 1000000000)}`);
  const finalName = path.join(dir, name);
  const rawStream = fs.createWriteStream(tempName);
  const closePromise = new Promise(resolve => {
    rawStream.on("close", () => {
      resolve("closed");
    });
  });
  let writeStream = rawStream;

  if (isGzip) {
    writeStream = zlib.createGzip();
    writeStream.pipe(rawStream);
    writeStream.on("close", () => {
      rawStream.close();
    });
  }

  async function close() {
    await this.writeStream.end();
    await this.closePromise;
    await fs.rename(tempName, finalName, () => true); // console.log('Renamed', tempName,finalName));
  }

  return {
    writeStream,
    closePromise,

    write(data) {
      return this.writeStream.write(data);
    },

    close
  };
};

module.exports = WriteStream;

/***/ }),

/***/ "./node_modules/config-point/dist/index.umd.js":
/*!*****************************************************!*\
  !*** ./node_modules/config-point/dist/index.umd.js ***!
  \*****************************************************/
/***/ ((module) => {

!function(u,e){ true?module.exports=e():0}(window,(function(){return function(u){var e={};function r(t){if(e[t])return e[t].exports;var n=e[t]={i:t,l:!1,exports:{}};return u[t].call(n.exports,n,n.exports,r),n.l=!0,n.exports}return r.m=u,r.c=e,r.d=function(u,e,t){r.o(u,e)||Object.defineProperty(u,e,{enumerable:!0,get:t})},r.r=function(u){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(u,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(u,"__esModule",{value:!0})},r.t=function(u,e){if(1&e&&(u=r(u)),8&e)return u;if(4&e&&"object"==typeof u&&u&&u.__esModule)return u;var t=Object.create(null);if(r.r(t),Object.defineProperty(t,"default",{enumerable:!0,value:u}),2&e&&"string"!=typeof u)for(var n in u)r.d(t,n,function(e){return u[e]}.bind(null,n));return t},r.n=function(u){var e=u&&u.__esModule?function(){return u.default}:function(){return u};return r.d(e,"a",e),e},r.o=function(u,e){return Object.prototype.hasOwnProperty.call(u,e)},r.p="",r(r.s=1)}([function(u,e,r){u.exports=function(){"use strict";function u(u,e){return u(e={exports:{}},e.exports),e.exports}var e=u((function(u){var e=u.exports="undefined"!=typeof window&&window.Math==Math?window:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")();"number"==typeof __g&&(__g=e)})),r=u((function(u){var e=u.exports={version:"2.6.5"};"number"==typeof __e&&(__e=e)})),t=(r.version,function(u){return"object"==typeof u?null!==u:"function"==typeof u}),n=function(u){if(!t(u))throw TypeError(u+" is not an object!");return u},D=function(u){try{return!!u()}catch(u){return!0}},i=!D((function(){return 7!=Object.defineProperty({},"a",{get:function(){return 7}}).a})),o=e.document,a=t(o)&&t(o.createElement),c=!i&&!D((function(){return 7!=Object.defineProperty((u="div",a?o.createElement(u):{}),"a",{get:function(){return 7}}).a;var u})),F=Object.defineProperty,C={f:i?Object.defineProperty:function(u,e,r){if(n(u),e=function(u,e){if(!t(u))return u;var r,n;if(e&&"function"==typeof(r=u.toString)&&!t(n=r.call(u)))return n;if("function"==typeof(r=u.valueOf)&&!t(n=r.call(u)))return n;if(!e&&"function"==typeof(r=u.toString)&&!t(n=r.call(u)))return n;throw TypeError("Can't convert object to primitive value")}(e,!0),n(r),c)try{return F(u,e,r)}catch(u){}if("get"in r||"set"in r)throw TypeError("Accessors not supported!");return"value"in r&&(u[e]=r.value),u}},A=i?function(u,e,r){return C.f(u,e,function(u,e){return{enumerable:!(1&u),configurable:!(2&u),writable:!(4&u),value:e}}(1,r))}:function(u,e,r){return u[e]=r,u},f={}.hasOwnProperty,E=function(u,e){return f.call(u,e)},s=0,l=Math.random(),B=u((function(u){var t=e["__core-js_shared__"]||(e["__core-js_shared__"]={});(u.exports=function(u,e){return t[u]||(t[u]=void 0!==e?e:{})})("versions",[]).push({version:r.version,mode:"global",copyright:"© 2019 Denis Pushkarev (zloirock.ru)"})}))("native-function-to-string",Function.toString),d=u((function(u){var t=function(u){return"Symbol(".concat(void 0===u?"":u,")_",(++s+l).toString(36))}("src"),n=(""+B).split("toString");r.inspectSource=function(u){return B.call(u)},(u.exports=function(u,r,D,i){var o="function"==typeof D;o&&(E(D,"name")||A(D,"name",r)),u[r]!==D&&(o&&(E(D,t)||A(D,t,u[r]?""+u[r]:n.join(String(r)))),u===e?u[r]=D:i?u[r]?u[r]=D:A(u,r,D):(delete u[r],A(u,r,D)))})(Function.prototype,"toString",(function(){return"function"==typeof this&&this[t]||B.call(this)}))})),p=function(u,e,r){if(function(u){if("function"!=typeof u)throw TypeError(u+" is not a function!")}(u),void 0===e)return u;switch(r){case 1:return function(r){return u.call(e,r)};case 2:return function(r,t){return u.call(e,r,t)};case 3:return function(r,t,n){return u.call(e,r,t,n)}}return function(){return u.apply(e,arguments)}},v=function(u,t,n){var D,i,o,a,c=u&v.F,F=u&v.G,C=u&v.S,f=u&v.P,E=u&v.B,s=F?e:C?e[t]||(e[t]={}):(e[t]||{}).prototype,l=F?r:r[t]||(r[t]={}),B=l.prototype||(l.prototype={});for(D in F&&(n=t),n)o=((i=!c&&s&&void 0!==s[D])?s:n)[D],a=E&&i?p(o,e):f&&"function"==typeof o?p(Function.call,o):o,s&&d(s,D,o,u&v.U),l[D]!=o&&A(l,D,a),f&&B[D]!=o&&(B[D]=o)};e.core=r,v.F=1,v.G=2,v.S=4,v.P=8,v.B=16,v.W=32,v.U=64,v.R=128;var y,g=v,h=Math.ceil,b=Math.floor,m=function(u){return isNaN(u=+u)?0:(u>0?b:h)(u)},w=(y=!1,function(u,e){var r,t,n=String(function(u){if(null==u)throw TypeError("Can't call method on  "+u);return u}(u)),D=m(e),i=n.length;return D<0||D>=i?y?"":void 0:(r=n.charCodeAt(D))<55296||r>56319||D+1===i||(t=n.charCodeAt(D+1))<56320||t>57343?y?n.charAt(D):r:y?n.slice(D,D+2):t-56320+(r-55296<<10)+65536});g(g.P,"String",{codePointAt:function(u){return w(this,u)}}),r.String.codePointAt;var O=Math.max,x=Math.min,S=function(u,e){return(u=m(u))<0?O(u+e,0):x(u,e)},P=String.fromCharCode,j=String.fromCodePoint;g(g.S+g.F*(!!j&&1!=j.length),"String",{fromCodePoint:function(u){for(var e,r=arguments,t=[],n=arguments.length,D=0;n>D;){if(e=+r[D++],S(e,1114111)!==e)throw RangeError(e+" is not a valid code point");t.push(e<65536?P(e):P(55296+((e-=65536)>>10),e%1024+56320))}return t.join("")}}),r.String.fromCodePoint;var _,N,V,I,M,k,L,T,K,$,R,z,J,U,G={Space_Separator:/[\u1680\u2000-\u200A\u202F\u205F\u3000]/,ID_Start:/[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312E\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEA\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AE\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF2D-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC00-\uDC34\uDC47-\uDC4A\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDF00-\uDF19]|\uD806[\uDCA0-\uDCDF\uDCFF\uDE00\uDE0B-\uDE32\uDE3A\uDE50\uDE5C-\uDE83\uDE86-\uDE89\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC2E\uDC40\uDC72-\uDC8F\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD30\uDD46]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F\uDFE0\uDFE1]|\uD821[\uDC00-\uDFEC]|\uD822[\uDC00-\uDEF2]|\uD82C[\uDC00-\uDD1E\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4\uDD00-\uDD43]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]/,ID_Continue:/[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u0860-\u086A\u08A0-\u08B4\u08B6-\u08BD\u08D4-\u08E1\u08E3-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u09FC\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0AF9-\u0AFF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C60-\u0C63\u0C66-\u0C6F\u0C80-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D00-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D54-\u0D57\u0D5F-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1C80-\u1C88\u1CD0-\u1CD2\u1CD4-\u1CF9\u1D00-\u1DF9\u1DFB-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312E\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FEA\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AE\uA7B0-\uA7B7\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C5\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA8FD\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF2D-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDCA-\uDDCC\uDDD0-\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE37\uDE3E\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF00-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF50\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC00-\uDC4A\uDC50-\uDC59\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDDD8-\uDDDD\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9\uDF00-\uDF19\uDF1D-\uDF2B\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDCFF\uDE00-\uDE3E\uDE47\uDE50-\uDE83\uDE86-\uDE99\uDEC0-\uDEF8]|\uD807[\uDC00-\uDC08\uDC0A-\uDC36\uDC38-\uDC40\uDC50-\uDC59\uDC72-\uDC8F\uDC92-\uDCA7\uDCA9-\uDCB6\uDD00-\uDD06\uDD08\uDD09\uDD0B-\uDD36\uDD3A\uDD3C\uDD3D\uDD3F-\uDD47\uDD50-\uDD59]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD81C-\uD820\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F\uDFE0\uDFE1]|\uD821[\uDC00-\uDFEC]|\uD822[\uDC00-\uDEF2]|\uD82C[\uDC00-\uDD1E\uDD70-\uDEFB]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD836[\uDE00-\uDE36\uDE3B-\uDE6C\uDE75\uDE84\uDE9B-\uDE9F\uDEA1-\uDEAF]|\uD838[\uDC00-\uDC06\uDC08-\uDC18\uDC1B-\uDC21\uDC23\uDC24\uDC26-\uDC2A]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6\uDD00-\uDD4A\uDD50-\uDD59]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF]/},Z=function(u){return"string"==typeof u&&G.Space_Separator.test(u)},q=function(u){return"string"==typeof u&&(u>="a"&&u<="z"||u>="A"&&u<="Z"||"$"===u||"_"===u||G.ID_Start.test(u))},H=function(u){return"string"==typeof u&&(u>="a"&&u<="z"||u>="A"&&u<="Z"||u>="0"&&u<="9"||"$"===u||"_"===u||"‌"===u||"‍"===u||G.ID_Continue.test(u))},X=function(u){return"string"==typeof u&&/[0-9]/.test(u)},W=function(u){return"string"==typeof u&&/[0-9A-Fa-f]/.test(u)};function Q(){for($="default",R="",z=!1,J=1;;){U=Y();var u=eu[$]();if(u)return u}}function Y(){if(_[I])return String.fromCodePoint(_.codePointAt(I))}function uu(){var u=Y();return"\n"===u?(M++,k=0):u?k+=u.length:k++,u&&(I+=u.length),u}var eu={default:function(){switch(U){case"\t":case"\v":case"\f":case" ":case" ":case"\ufeff":case"\n":case"\r":case"\u2028":case"\u2029":return void uu();case"/":return uu(),void($="comment");case void 0:return uu(),ru("eof")}if(!Z(U))return eu[N]();uu()},comment:function(){switch(U){case"*":return uu(),void($="multiLineComment");case"/":return uu(),void($="singleLineComment")}throw au(uu())},multiLineComment:function(){switch(U){case"*":return uu(),void($="multiLineCommentAsterisk");case void 0:throw au(uu())}uu()},multiLineCommentAsterisk:function(){switch(U){case"*":return void uu();case"/":return uu(),void($="default");case void 0:throw au(uu())}uu(),$="multiLineComment"},singleLineComment:function(){switch(U){case"\n":case"\r":case"\u2028":case"\u2029":return uu(),void($="default");case void 0:return uu(),ru("eof")}uu()},value:function(){switch(U){case"{":case"[":return ru("punctuator",uu());case"n":return uu(),tu("ull"),ru("null",null);case"t":return uu(),tu("rue"),ru("boolean",!0);case"f":return uu(),tu("alse"),ru("boolean",!1);case"-":case"+":return"-"===uu()&&(J=-1),void($="sign");case".":return R=uu(),void($="decimalPointLeading");case"0":return R=uu(),void($="zero");case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":return R=uu(),void($="decimalInteger");case"I":return uu(),tu("nfinity"),ru("numeric",1/0);case"N":return uu(),tu("aN"),ru("numeric",NaN);case'"':case"'":return z='"'===uu(),R="",void($="string")}throw au(uu())},identifierNameStartEscape:function(){if("u"!==U)throw au(uu());uu();var u=nu();switch(u){case"$":case"_":break;default:if(!q(u))throw Fu()}R+=u,$="identifierName"},identifierName:function(){switch(U){case"$":case"_":case"‌":case"‍":return void(R+=uu());case"\\":return uu(),void($="identifierNameEscape")}if(!H(U))return ru("identifier",R);R+=uu()},identifierNameEscape:function(){if("u"!==U)throw au(uu());uu();var u=nu();switch(u){case"$":case"_":case"‌":case"‍":break;default:if(!H(u))throw Fu()}R+=u,$="identifierName"},sign:function(){switch(U){case".":return R=uu(),void($="decimalPointLeading");case"0":return R=uu(),void($="zero");case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":return R=uu(),void($="decimalInteger");case"I":return uu(),tu("nfinity"),ru("numeric",J*(1/0));case"N":return uu(),tu("aN"),ru("numeric",NaN)}throw au(uu())},zero:function(){switch(U){case".":return R+=uu(),void($="decimalPoint");case"e":case"E":return R+=uu(),void($="decimalExponent");case"x":case"X":return R+=uu(),void($="hexadecimal")}return ru("numeric",0*J)},decimalInteger:function(){switch(U){case".":return R+=uu(),void($="decimalPoint");case"e":case"E":return R+=uu(),void($="decimalExponent")}if(!X(U))return ru("numeric",J*Number(R));R+=uu()},decimalPointLeading:function(){if(X(U))return R+=uu(),void($="decimalFraction");throw au(uu())},decimalPoint:function(){switch(U){case"e":case"E":return R+=uu(),void($="decimalExponent")}return X(U)?(R+=uu(),void($="decimalFraction")):ru("numeric",J*Number(R))},decimalFraction:function(){switch(U){case"e":case"E":return R+=uu(),void($="decimalExponent")}if(!X(U))return ru("numeric",J*Number(R));R+=uu()},decimalExponent:function(){switch(U){case"+":case"-":return R+=uu(),void($="decimalExponentSign")}if(X(U))return R+=uu(),void($="decimalExponentInteger");throw au(uu())},decimalExponentSign:function(){if(X(U))return R+=uu(),void($="decimalExponentInteger");throw au(uu())},decimalExponentInteger:function(){if(!X(U))return ru("numeric",J*Number(R));R+=uu()},hexadecimal:function(){if(W(U))return R+=uu(),void($="hexadecimalInteger");throw au(uu())},hexadecimalInteger:function(){if(!W(U))return ru("numeric",J*Number(R));R+=uu()},string:function(){switch(U){case"\\":return uu(),void(R+=function(){switch(Y()){case"b":return uu(),"\b";case"f":return uu(),"\f";case"n":return uu(),"\n";case"r":return uu(),"\r";case"t":return uu(),"\t";case"v":return uu(),"\v";case"0":if(uu(),X(Y()))throw au(uu());return"\0";case"x":return uu(),function(){var u="",e=Y();if(!W(e))throw au(uu());if(u+=uu(),e=Y(),!W(e))throw au(uu());return u+=uu(),String.fromCodePoint(parseInt(u,16))}();case"u":return uu(),nu();case"\n":case"\u2028":case"\u2029":return uu(),"";case"\r":return uu(),"\n"===Y()&&uu(),"";case"1":case"2":case"3":case"4":case"5":case"6":case"7":case"8":case"9":case void 0:throw au(uu())}return uu()}());case'"':return z?(uu(),ru("string",R)):void(R+=uu());case"'":return z?void(R+=uu()):(uu(),ru("string",R));case"\n":case"\r":throw au(uu());case"\u2028":case"\u2029":!function(u){console.warn("JSON5: '"+Cu(u)+"' in strings is not valid ECMAScript; consider escaping")}(U);break;case void 0:throw au(uu())}R+=uu()},start:function(){switch(U){case"{":case"[":return ru("punctuator",uu())}$="value"},beforePropertyName:function(){switch(U){case"$":case"_":return R=uu(),void($="identifierName");case"\\":return uu(),void($="identifierNameStartEscape");case"}":return ru("punctuator",uu());case'"':case"'":return z='"'===uu(),void($="string")}if(q(U))return R+=uu(),void($="identifierName");throw au(uu())},afterPropertyName:function(){if(":"===U)return ru("punctuator",uu());throw au(uu())},beforePropertyValue:function(){$="value"},afterPropertyValue:function(){switch(U){case",":case"}":return ru("punctuator",uu())}throw au(uu())},beforeArrayValue:function(){if("]"===U)return ru("punctuator",uu());$="value"},afterArrayValue:function(){switch(U){case",":case"]":return ru("punctuator",uu())}throw au(uu())},end:function(){throw au(uu())}};function ru(u,e){return{type:u,value:e,line:M,column:k}}function tu(u){for(var e=0,r=u;e<r.length;e+=1){var t=r[e];if(Y()!==t)throw au(uu());uu()}}function nu(){for(var u="",e=4;e-- >0;){var r=Y();if(!W(r))throw au(uu());u+=uu()}return String.fromCodePoint(parseInt(u,16))}var Du={start:function(){if("eof"===L.type)throw cu();iu()},beforePropertyName:function(){switch(L.type){case"identifier":case"string":return T=L.value,void(N="afterPropertyName");case"punctuator":return void ou();case"eof":throw cu()}},afterPropertyName:function(){if("eof"===L.type)throw cu();N="beforePropertyValue"},beforePropertyValue:function(){if("eof"===L.type)throw cu();iu()},beforeArrayValue:function(){if("eof"===L.type)throw cu();"punctuator"!==L.type||"]"!==L.value?iu():ou()},afterPropertyValue:function(){if("eof"===L.type)throw cu();switch(L.value){case",":return void(N="beforePropertyName");case"}":ou()}},afterArrayValue:function(){if("eof"===L.type)throw cu();switch(L.value){case",":return void(N="beforeArrayValue");case"]":ou()}},end:function(){}};function iu(){var u;switch(L.type){case"punctuator":switch(L.value){case"{":u={};break;case"[":u=[]}break;case"null":case"boolean":case"numeric":case"string":u=L.value}if(void 0===K)K=u;else{var e=V[V.length-1];Array.isArray(e)?e.push(u):e[T]=u}if(null!==u&&"object"==typeof u)V.push(u),N=Array.isArray(u)?"beforeArrayValue":"beforePropertyName";else{var r=V[V.length-1];N=null==r?"end":Array.isArray(r)?"afterArrayValue":"afterPropertyValue"}}function ou(){V.pop();var u=V[V.length-1];N=null==u?"end":Array.isArray(u)?"afterArrayValue":"afterPropertyValue"}function au(u){return Au(void 0===u?"JSON5: invalid end of input at "+M+":"+k:"JSON5: invalid character '"+Cu(u)+"' at "+M+":"+k)}function cu(){return Au("JSON5: invalid end of input at "+M+":"+k)}function Fu(){return Au("JSON5: invalid identifier character at "+M+":"+(k-=5))}function Cu(u){var e={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","\t":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"};if(e[u])return e[u];if(u<" "){var r=u.charCodeAt(0).toString(16);return"\\x"+("00"+r).substring(r.length)}return u}function Au(u){var e=new SyntaxError(u);return e.lineNumber=M,e.columnNumber=k,e}return{parse:function(u,e){_=String(u),N="start",V=[],I=0,M=1,k=0,L=void 0,T=void 0,K=void 0;do{L=Q(),Du[N]()}while("eof"!==L.type);return"function"==typeof e?function u(e,r,t){var n=e[r];if(null!=n&&"object"==typeof n)for(var D in n){var i=u(n,D,t);void 0===i?delete n[D]:n[D]=i}return t.call(e,r,n)}({"":K},"",e):K},stringify:function(u,e,r){var t,n,D,i=[],o="",a="";if(null==e||"object"!=typeof e||Array.isArray(e)||(r=e.space,D=e.quote,e=e.replacer),"function"==typeof e)n=e;else if(Array.isArray(e)){t=[];for(var c=0,F=e;c<F.length;c+=1){var C=F[c],A=void 0;"string"==typeof C?A=C:("number"==typeof C||C instanceof String||C instanceof Number)&&(A=String(C)),void 0!==A&&t.indexOf(A)<0&&t.push(A)}}return r instanceof Number?r=Number(r):r instanceof String&&(r=String(r)),"number"==typeof r?r>0&&(r=Math.min(10,Math.floor(r)),a="          ".substr(0,r)):"string"==typeof r&&(a=r.substr(0,10)),f("",{"":u});function f(u,e){var r=e[u];switch(null!=r&&("function"==typeof r.toJSON5?r=r.toJSON5(u):"function"==typeof r.toJSON&&(r=r.toJSON(u))),n&&(r=n.call(e,u,r)),r instanceof Number?r=Number(r):r instanceof String?r=String(r):r instanceof Boolean&&(r=r.valueOf()),r){case null:return"null";case!0:return"true";case!1:return"false"}return"string"==typeof r?E(r):"number"==typeof r?String(r):"object"==typeof r?Array.isArray(r)?function(u){if(i.indexOf(u)>=0)throw TypeError("Converting circular structure to JSON5");i.push(u);var e=o;o+=a;for(var r,t=[],n=0;n<u.length;n++){var D=f(String(n),u);t.push(void 0!==D?D:"null")}if(0===t.length)r="[]";else if(""===a){var c=t.join(",");r="["+c+"]"}else{var F=",\n"+o,C=t.join(F);r="[\n"+o+C+",\n"+e+"]"}return i.pop(),o=e,r}(r):function(u){if(i.indexOf(u)>=0)throw TypeError("Converting circular structure to JSON5");i.push(u);var e=o;o+=a;for(var r,n,D=t||Object.keys(u),c=[],F=0,C=D;F<C.length;F+=1){var A=C[F],E=f(A,u);if(void 0!==E){var l=s(A)+":";""!==a&&(l+=" "),l+=E,c.push(l)}}if(0===c.length)r="{}";else if(""===a)n=c.join(","),r="{"+n+"}";else{var B=",\n"+o;n=c.join(B),r="{\n"+o+n+",\n"+e+"}"}return i.pop(),o=e,r}(r):void 0}function E(u){for(var e={"'":.1,'"':.2},r={"'":"\\'",'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f","\n":"\\n","\r":"\\r","\t":"\\t","\v":"\\v","\0":"\\0","\u2028":"\\u2028","\u2029":"\\u2029"},t="",n=0;n<u.length;n++){var i=u[n];switch(i){case"'":case'"':e[i]++,t+=i;continue;case"\0":if(X(u[n+1])){t+="\\x00";continue}}if(r[i])t+=r[i];else if(i<" "){var o=i.charCodeAt(0).toString(16);t+="\\x"+("00"+o).substring(o.length)}else t+=i}var a=D||Object.keys(e).reduce((function(u,r){return e[u]<e[r]?u:r}));return a+(t=t.replace(new RegExp(a,"g"),r[a]))+a}function s(u){if(0===u.length)return E(u);var e=String.fromCodePoint(u.codePointAt(0));if(!q(e))return E(u);for(var r=e.length;r<u.length;r++)if(!H(String.fromCodePoint(u.codePointAt(r))))return E(u);return u}}}}()},function(u,e,r){"use strict";r.r(e),r.d(e,"ConfigPoint",(function(){return g})),r.d(e,"ConfigPointOperation",(function(){return $})),r.d(e,"extendConfiguration",(function(){return H})),r.d(e,"createConfiguration",(function(){return X})),r.d(e,"ReplaceOp",(function(){return L})),r.d(e,"SortOp",(function(){return T})),r.d(e,"ReferenceOp",(function(){return M})),r.d(e,"DeleteOp",(function(){return I})),r.d(e,"InsertOp",(function(){return V})),r.d(e,"safeFunction",(function(){return G})),r.d(e,"register",(function(){return Z})),r.d(e,"getConfig",(function(){return q})),r.d(e,"plugins",(function(){return W})),r.d(e,"loadSearchConfigPoint",(function(){return O})),r.d(e,"loadFile",(function(){return w}));function t(u){return function(u){if(Array.isArray(u))return a(u)}(u)||function(u){if("undefined"!=typeof Symbol&&null!=u[Symbol.iterator]||null!=u["@@iterator"])return Array.from(u)}(u)||o(u)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function n(u,e){var r=Object.keys(u);if(Object.getOwnPropertySymbols){var t=Object.getOwnPropertySymbols(u);e&&(t=t.filter((function(e){return Object.getOwnPropertyDescriptor(u,e).enumerable}))),r.push.apply(r,t)}return r}function D(u){for(var e=1;e<arguments.length;e++){var r=null!=arguments[e]?arguments[e]:{};e%2?n(Object(r),!0).forEach((function(e){i(u,e,r[e])})):Object.getOwnPropertyDescriptors?Object.defineProperties(u,Object.getOwnPropertyDescriptors(r)):n(Object(r)).forEach((function(e){Object.defineProperty(u,e,Object.getOwnPropertyDescriptor(r,e))}))}return u}function i(u,e,r){return e in u?Object.defineProperty(u,e,{value:r,enumerable:!0,configurable:!0,writable:!0}):u[e]=r,u}function o(u,e){if(u){if("string"==typeof u)return a(u,e);var r=Object.prototype.toString.call(u).slice(8,-1);return"Object"===r&&u.constructor&&(r=u.constructor.name),"Map"===r||"Set"===r?Array.from(u):"Arguments"===r||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)?a(u,e):void 0}}function a(u,e){(null==e||e>u.length)&&(e=u.length);for(var r=0,t=new Array(e);r<e;r++)t[r]=u[r];return t}function c(u){return(c="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(u){return typeof u}:function(u){return u&&"function"==typeof Symbol&&u.constructor===Symbol&&u!==Symbol.prototype?"symbol":typeof u})(u)}var F={},C={};function A(u){var e=c(u);return null==u||"number"==e||"boolean"==e||"string"==e||"bigint"==e}var f=function(u,e){if(A(u))return u;var r=c(u);if("function"===r)return u;if("object"===r)return d(Array.isArray(u)?[]:{},u,e);throw new Error("The value ".concat(u," of type ").concat(r," isn't a known type for merging."))},E=function(u){var e=u.base,r=u.bKey,t=u.sVal;if(!t)return r;if(void 0!==t.position)return t.position;if(!t||void 0===t.id&&"number"==typeof r)return r;var n=t.key||"id",D=void 0===t.id?r:t.id;if(void 0!==D){for(var i=0;i<e.length;i++)if(e[i]==D||e[i]&&e[i][n]===D)return i;return e.length}},s=function(u){u.base;var e=u.bKey,r=u.sVal;return r&&(r.id||r.position)||e},l=function(u,e,r,t){var n=u.opSrcMap;if(!n){if(!r)return;n={},Object.defineProperty(u,"opSrcMap",{configurable:!0,enumerable:!1,value:n})}var D=n[e];return D||!r?D:n[e]=f(r,t)};function B(u,e,r,t,n){var D=e[r],i=u,o=n||r;Array.isArray(i)&&!Array.isArray(e)&&(o=E({base:i,bKey:o,sVal:D,context:t}));var a=i[o],c=function(u){if(u&&u.configOperation&&!u.isHidden){var e=u.configOperation,r=g.ConfigPointOperation[e];return r||console.log("configOperation",e,"specified but not defined - might be lazy defined later"),r}}(D),F=function(u,e,r){return e&&(r&&r.alias||"_"==u[0]&&u.substring(1))||u}(o,c,D),C=l(i,F);return c?c.immediate?c.immediate({sVal:D,base:i,bKey:o,key:r,context:t}):(C||(C=l(i,F,D,t),i[F]&&!0!==C.replace&&B(C,i,F,t,"value")),void Object.defineProperty(i,F,{configurable:!0,enumerable:!0,get:function(){return void 0!==C.computedValue||(C.computedValue=c.getter({base:i,bKey:o,key:r,context:t,opSrc:C})),C.computedValue},set:function(u){C.computedValue=u}})):(C&&(i=C,o="value",a=C.value,delete C.computedValue),Array.isArray(i)&&null==D?a:A(a)?i[o]=f(D,t):d(a,D,t))}function d(u,e,r){for(var t in e)B(u,e,t,r);return u}var p=function(u,e){u._loadListeners||Object.defineProperty(u,"_loadListeners",{value:[]}),-1==u._loadListeners.indexOf(e)&&u._loadListeners.push(e),e(u)},v={extendConfig:function(u){var e=u.name||"_order"+this._extensions._order.length;if(this._extensions[e])throw new Error("Level already has extension ".concat(e));return this._extensions[e]=u,this._extensions._order.push(u),this.applyExtensions(),this},applyExtensions:function(){var u=this;if(this._preExistingKeys)for(var e=0,r=Object.keys(this);e<r.length;e++){var t=r[e];this._preExistingKeys[t]||delete this[t]}else Object.defineProperty(this,"_preExistingKeys",{writable:!0,configurable:!0,value:{}}),this._preExistingKeys=Object.keys(this).reduce((function(u,e){return u[e]=!0,u}),this._preExistingKeys);delete this.opSrcMap,this._applyExtensionsTo(this),this._loadListeners&&this._loadListeners.forEach((function(e){return e(u)}))},_applyExtensionsTo:function(u){var e=this._configBase;e&&e._applyExtensionsTo?e._applyExtensionsTo(u):d(u,e,u);var r,t=function(u,e){var r="undefined"!=typeof Symbol&&u[Symbol.iterator]||u["@@iterator"];if(!r){if(Array.isArray(u)||(r=o(u))||e&&u&&"number"==typeof u.length){r&&(u=r);var t=0,n=function(){};return{s:n,n:function(){return t>=u.length?{done:!0}:{done:!1,value:u[t++]}},e:function(u){throw u},f:n}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}var D,i=!0,a=!1;return{s:function(){r=r.call(u)},n:function(){var u=r.next();return i=u.done,u},e:function(u){a=!0,D=u},f:function(){try{i||null==r.return||r.return()}finally{if(a)throw D}}}}(this._extensions._order);try{for(t.s();!(r=t.n()).done;){d(u,r.value,u)}}catch(u){t.e(u)}finally{t.f()}}},y={addConfig:function(u,e){if(e===u)throw new Error("The configuration point ".concat(u," uses itself as a base"));var r="string"==typeof e?this.addConfig(e):e,t=F[u];if(t||(F[u]=t=function(u,e){if(!e)return u;for(var r=0,t=Object.keys(e);r<t.length;r++){var n=t[r];Object.defineProperty(u,n,{value:e[n],enumerable:!1})}return u}({},v),Object.defineProperty(t,"_configName",{value:u}),Object.defineProperty(this,u,{enumerable:!0,configurable:!0,get:function(){return F[u]}}),Object.defineProperty(t,"_configBase",{value:void 0,writable:!0}),Object.defineProperty(t,"_extensions",{value:{_order:[]}})),r){if(t._configBase!=r){var n=r._configName;if(t._configBase=r,n)return t._configReload||Object.defineProperty(t,"_configReload",{value:function(){t.applyExtensions()}}),p(r,t._configReload),t}t.applyExtensions()}return t},addLoadListener:p,register:function(){for(var u=this,e={},r=arguments.length,n=new Array(r),i=0;i<r;i++)n[i]=arguments[i];return n.forEach((function(r){if(Array.isArray(r))e=D(D({},e),u.register.apply(u,t(r)));else{var n=r.configName;if(n){var i=r.configBase,o=r.extension;i&&(e[n]=u.addConfig(n,i)),o&&(e[n]=u.addConfig(n).extendConfig(o))}else Object.keys(r).forEach((function(t){var n=r[t],D=n.configBase;e[t]=u.addConfig(t,D).extendConfig(n)}))}})),e},hasConfig:function(u){return null!=F[u]},getConfig:function(u){return"string"==typeof u?F[u]:u},clear:function(){var u=this;F={},Object.keys(C).forEach((function(e){u.register(C)}))},registerRoot:function(u){return Object.assign(C,u),g.register(u)},createConfiguration:function(u,e,r){if(r){var t="_intermediate_".concat(u);return g.register({configName:t,configBase:r,extension:e}),g.register({configName:u,configBase:t})[u]}return g.register({configName:u,configBase:e})[u]},extendConfiguration:function(u,e){return g.register({configName:u,extension:e})[u]}},g=D({name:"ConfigPoint"},y),h=g,b=r(0),m=r.n(b),w=function(u,e){return e.readFile(u).then((function(u){var e=m.a.parse(u);return Q.register(e)}))},O=function(u,e,r){var t=window.location.search,n=new URLSearchParams(t),D=u?[u]:null;if(r){var i=n.getAll(r);i&&i.length&&(i.forEach((function(u){if(!u.match(/^[a-zA-Z0-9]+$/))throw new Error("Parameter ".concat(r," has invalid value ").concat(u))})),D=i)}if(D){var o={};return D.forEach((function(u){if(!o[u]){var r=(e&&e+"/"+u||u)+".json5";o[u]=function(u,e){var r=new XMLHttpRequest,t=new Promise((function(e,t){r.addEventListener("load",(function(){try{var n=m.a.parse(r.responseText),D=h.register(n);e(D)}catch(e){console.log("Unable to load ".concat(u)),t("Unable to load ".concat(u," because ").concat(e))}}))}));return r.open("GET",e),r.send(),t}(u,r)}})),Promise.all(Object.values(o))}return Promise.resolve({})};function x(u){return function(u){if(Array.isArray(u))return S(u)}(u)||function(u){if("undefined"!=typeof Symbol&&null!=u[Symbol.iterator]||null!=u["@@iterator"])return Array.from(u)}(u)||function(u,e){if(!u)return;if("string"==typeof u)return S(u,e);var r=Object.prototype.toString.call(u).slice(8,-1);"Object"===r&&u.constructor&&(r=u.constructor.name);if("Map"===r||"Set"===r)return Array.from(u);if("Arguments"===r||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r))return S(u,e)}(u)||function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}()}function S(u,e){(null==e||e>u.length)&&(e=u.length);for(var r=0,t=new Array(e);r<e;r++)t[r]=u[r];return t}function P(u,e){var r=Object.keys(u);if(Object.getOwnPropertySymbols){var t=Object.getOwnPropertySymbols(u);e&&(t=t.filter((function(e){return Object.getOwnPropertyDescriptor(u,e).enumerable}))),r.push.apply(r,t)}return r}function j(u){for(var e=1;e<arguments.length;e++){var r=null!=arguments[e]?arguments[e]:{};e%2?P(Object(r),!0).forEach((function(e){_(u,e,r[e])})):Object.getOwnPropertyDescriptors?Object.defineProperties(u,Object.getOwnPropertyDescriptors(r)):P(Object(r)).forEach((function(e){Object.defineProperty(u,e,Object.getOwnPropertyDescriptor(r,e))}))}return u}function _(u,e,r){return e in u?Object.defineProperty(u,e,{value:r,enumerable:!0,configurable:!0,writable:!0}):u[e]=r,u}var N=function(u,e){return j({_configOperation:u,create:function(u){return j(j({},u),{},{configOperation:this._configOperation})},at:function(u,e,r){return this.create(j(j({},r),{},{position:u,value:e}))},id:function(u,e,r){return this.create(j(j({},r),{},{id:u,value:e}))}},e)},V=N("insert",{immediate:function(u){var e=u.sVal,r=u.base,t=(u.bKey,u.context),n=E(u);return r.splice(n||0,0,f(e.value,t)),r}}),I=N("delete",{immediate:function(u){var e=u.base;u.bKey,u.sVal;if(Array.isArray(e)){var r=E(u);if(r>=0)return e.splice(r,1)}else if(e){var t=s(u);if(void 0===t)return;delete e[t]}return e}}),M=N("reference",{createCurrent:function(u,e){return this.create(j({reference:u},e))},getter:function(u){var e=u.context,r=u.opSrc,t=r.reference,n=r.transform,D=r.source,i=D?h.addConfig(D):e;if(D&&!t)return i;if(i){var o=i[t];return n?n(o):o}}}),k=N("bind",{createCurrent:function(u,e){return this.create(j({reference:u},e))},getter:function(u){var e=u.base,r=u.context,t=u.opSrc,n=t.reference,D=t.source,i=t.value,o=D?h.addConfig(D):r;if(o||void 0!==i){var a=void 0===i?o[n]:i;return"function"==typeof a?a.bind(e):a}}}),L=N("replace",{immediate:function(u){var e=u.sVal,r=u.context,t=u.base;if(!Array.isArray(t))return t[s(u)]=f(e.value,r);var n=E(u);return void 0!==n?t.splice(n,1,f(e.value,r)):void 0}}),T=N("sort",{createSort:function(u,e,r,t){return this.create(j(j({},t),{},{reference:u,sortKey:e,valueReference:r}))},getter:function(u){u.base,u.bKey;var e=u.context,r=u.opSrc;null==r.original&&(r.original=[]);var t=r.original,n=r.valueReference,D=r.sortKey,i=r.reference,o=r.value,a=i?e[i]:o;t.length=0;if(!a)return t;var c=Object.values(a).filter((function(u){return null!=u&&(!n||void 0!==u[n])}));return D&&(c=c.filter((function(u){return null!==u[D]}))),c.sort((function(u,e){var r=n?u[n]:u,t=n?e[n]:e,i=D?u[D]:r,o=D?e[D]:t;return i===o?0:i<o?-1:1})),c=c.map((function(u){return n?u[n]:u})),t.splice.apply(t,[0,t.length].concat(x(c))),t}}),K=N("safe",{createCurrent:function(u,e){return this.create(j({reference:u},e))},getter:function(u){u.base;var e=u.context,r=u.opSrc,t=r.reference,n=r.source,D=r.value,i=n?h.addConfig(n):e;if(i||void 0!==D)return G(void 0===D?i[t]:D)}}),$=h.registerRoot({ConfigPointOperation:{configBase:{sort:T,insert:V,delete:I,safe:K,bind:k,reference:M,replace:L,functions:{safeFunction:G}}}}).ConfigPointOperation,R=/(?:[a-z$_][a-z0-9$_]*(\.[a-z0-9$_]*)*)|(?:[;\\])|(?:`[^`]*`)|(?:"[^"]*")|(?:'[^']*')/gi,z=/(?:\$\{[^}]*\})/g,J=function(u){return u.replace(z,(function(u){return"${"+U(u.substring(2,u.length-1))+"}"}))},U=function(u){return u.replace(R,(function(u){return 0===u.indexOf("Math.")||'"'===u[0]||"'"===u[0]?u:"`"===u[0]?J(u):"this."+u}))};function G(u){if(!u)return function(){};var e=U(u),r=Function('"use strict"; var $data = this;return ('.concat(e,")"));return function(u){return r.bind(u)()}}h.register({plugins:{}}).plugins;var Z=g.register.bind(g),q=g.getConfig.bind(g),H=g.extendConfiguration.bind(g),X=g.createConfiguration.bind(g),W=g.getConfig("plugins"),Q=e.default=g;g.loadSearchConfigPoint=O}])}));
//# sourceMappingURL=index.umd.js.map

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/index.js":
/*!**************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/index.js ***!
  \**************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "NIL": () => (/* reexport safe */ _nil_js__WEBPACK_IMPORTED_MODULE_4__["default"]),
/* harmony export */   "parse": () => (/* reexport safe */ _parse_js__WEBPACK_IMPORTED_MODULE_8__["default"]),
/* harmony export */   "stringify": () => (/* reexport safe */ _stringify_js__WEBPACK_IMPORTED_MODULE_7__["default"]),
/* harmony export */   "v1": () => (/* reexport safe */ _v1_js__WEBPACK_IMPORTED_MODULE_0__["default"]),
/* harmony export */   "v3": () => (/* reexport safe */ _v3_js__WEBPACK_IMPORTED_MODULE_1__["default"]),
/* harmony export */   "v4": () => (/* reexport safe */ _v4_js__WEBPACK_IMPORTED_MODULE_2__["default"]),
/* harmony export */   "v5": () => (/* reexport safe */ _v5_js__WEBPACK_IMPORTED_MODULE_3__["default"]),
/* harmony export */   "validate": () => (/* reexport safe */ _validate_js__WEBPACK_IMPORTED_MODULE_6__["default"]),
/* harmony export */   "version": () => (/* reexport safe */ _version_js__WEBPACK_IMPORTED_MODULE_5__["default"])
/* harmony export */ });
/* harmony import */ var _v1_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./v1.js */ "./node_modules/uuid/dist/esm-node/v1.js");
/* harmony import */ var _v3_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./v3.js */ "./node_modules/uuid/dist/esm-node/v3.js");
/* harmony import */ var _v4_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./v4.js */ "./node_modules/uuid/dist/esm-node/v4.js");
/* harmony import */ var _v5_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./v5.js */ "./node_modules/uuid/dist/esm-node/v5.js");
/* harmony import */ var _nil_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./nil.js */ "./node_modules/uuid/dist/esm-node/nil.js");
/* harmony import */ var _version_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./version.js */ "./node_modules/uuid/dist/esm-node/version.js");
/* harmony import */ var _validate_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./validate.js */ "./node_modules/uuid/dist/esm-node/validate.js");
/* harmony import */ var _stringify_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./stringify.js */ "./node_modules/uuid/dist/esm-node/stringify.js");
/* harmony import */ var _parse_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./parse.js */ "./node_modules/uuid/dist/esm-node/parse.js");










/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/md5.js":
/*!************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/md5.js ***!
  \************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var crypto__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! crypto */ "crypto");
/* harmony import */ var crypto__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(crypto__WEBPACK_IMPORTED_MODULE_0__);


function md5(bytes) {
  if (Array.isArray(bytes)) {
    bytes = Buffer.from(bytes);
  } else if (typeof bytes === 'string') {
    bytes = Buffer.from(bytes, 'utf8');
  }

  return crypto__WEBPACK_IMPORTED_MODULE_0___default().createHash('md5').update(bytes).digest();
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (md5);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/nil.js":
/*!************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/nil.js ***!
  \************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ('00000000-0000-0000-0000-000000000000');

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/parse.js":
/*!**************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/parse.js ***!
  \**************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _validate_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./validate.js */ "./node_modules/uuid/dist/esm-node/validate.js");


function parse(uuid) {
  if (!(0,_validate_js__WEBPACK_IMPORTED_MODULE_0__["default"])(uuid)) {
    throw TypeError('Invalid UUID');
  }

  let v;
  const arr = new Uint8Array(16); // Parse ########-....-....-....-............

  arr[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
  arr[1] = v >>> 16 & 0xff;
  arr[2] = v >>> 8 & 0xff;
  arr[3] = v & 0xff; // Parse ........-####-....-....-............

  arr[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
  arr[5] = v & 0xff; // Parse ........-....-####-....-............

  arr[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
  arr[7] = v & 0xff; // Parse ........-....-....-####-............

  arr[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
  arr[9] = v & 0xff; // Parse ........-....-....-....-############
  // (Use "/" to avoid 32-bit truncation when bit-shifting high-order bytes)

  arr[10] = (v = parseInt(uuid.slice(24, 36), 16)) / 0x10000000000 & 0xff;
  arr[11] = v / 0x100000000 & 0xff;
  arr[12] = v >>> 24 & 0xff;
  arr[13] = v >>> 16 & 0xff;
  arr[14] = v >>> 8 & 0xff;
  arr[15] = v & 0xff;
  return arr;
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (parse);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/regex.js":
/*!**************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/regex.js ***!
  \**************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/rng.js":
/*!************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/rng.js ***!
  \************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ rng)
/* harmony export */ });
/* harmony import */ var crypto__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! crypto */ "crypto");
/* harmony import */ var crypto__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(crypto__WEBPACK_IMPORTED_MODULE_0__);

const rnds8Pool = new Uint8Array(256); // # of random values to pre-allocate

let poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    crypto__WEBPACK_IMPORTED_MODULE_0___default().randomFillSync(rnds8Pool);
    poolPtr = 0;
  }

  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/sha1.js":
/*!*************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/sha1.js ***!
  \*************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var crypto__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! crypto */ "crypto");
/* harmony import */ var crypto__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(crypto__WEBPACK_IMPORTED_MODULE_0__);


function sha1(bytes) {
  if (Array.isArray(bytes)) {
    bytes = Buffer.from(bytes);
  } else if (typeof bytes === 'string') {
    bytes = Buffer.from(bytes, 'utf8');
  }

  return crypto__WEBPACK_IMPORTED_MODULE_0___default().createHash('sha1').update(bytes).digest();
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (sha1);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/stringify.js":
/*!******************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/stringify.js ***!
  \******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _validate_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./validate.js */ "./node_modules/uuid/dist/esm-node/validate.js");

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */

const byteToHex = [];

for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).substr(1));
}

function stringify(arr, offset = 0) {
  // Note: Be careful editing this code!  It's been tuned for performance
  // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
  const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase(); // Consistency check for valid UUID.  If this throws, it's likely due to one
  // of the following:
  // - One or more input array values don't map to a hex octet (leading to
  // "undefined" in the uuid)
  // - Invalid input values for the RFC `version` or `variant` fields

  if (!(0,_validate_js__WEBPACK_IMPORTED_MODULE_0__["default"])(uuid)) {
    throw TypeError('Stringified UUID is invalid');
  }

  return uuid;
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (stringify);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/v1.js":
/*!***********************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/v1.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _rng_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./rng.js */ "./node_modules/uuid/dist/esm-node/rng.js");
/* harmony import */ var _stringify_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./stringify.js */ "./node_modules/uuid/dist/esm-node/stringify.js");

 // **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

let _nodeId;

let _clockseq; // Previous uuid creation time


let _lastMSecs = 0;
let _lastNSecs = 0; // See https://github.com/uuidjs/uuid for API details

function v1(options, buf, offset) {
  let i = buf && offset || 0;
  const b = buf || new Array(16);
  options = options || {};
  let node = options.node || _nodeId;
  let clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq; // node and clockseq need to be initialized to random values if they're not
  // specified.  We do this lazily to minimize issues related to insufficient
  // system entropy.  See #189

  if (node == null || clockseq == null) {
    const seedBytes = options.random || (options.rng || _rng_js__WEBPACK_IMPORTED_MODULE_0__["default"])();

    if (node == null) {
      // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
      node = _nodeId = [seedBytes[0] | 0x01, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
    }

    if (clockseq == null) {
      // Per 4.2.2, randomize (14 bit) clockseq
      clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 0x3fff;
    }
  } // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.


  let msecs = options.msecs !== undefined ? options.msecs : Date.now(); // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock

  let nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1; // Time since last uuid creation (in msecs)

  const dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 10000; // Per 4.2.1.2, Bump clockseq on clock regression

  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  } // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval


  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  } // Per 4.2.1.2 Throw error if too many uuids are requested


  if (nsecs >= 10000) {
    throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq; // Per 4.1.4 - Convert from unix epoch to Gregorian epoch

  msecs += 12219292800000; // `time_low`

  const tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff; // `time_mid`

  const tmh = msecs / 0x100000000 * 10000 & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff; // `time_high_and_version`

  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version

  b[i++] = tmh >>> 16 & 0xff; // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)

  b[i++] = clockseq >>> 8 | 0x80; // `clock_seq_low`

  b[i++] = clockseq & 0xff; // `node`

  for (let n = 0; n < 6; ++n) {
    b[i + n] = node[n];
  }

  return buf || (0,_stringify_js__WEBPACK_IMPORTED_MODULE_1__["default"])(b);
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (v1);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/v3.js":
/*!***********************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/v3.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _v35_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./v35.js */ "./node_modules/uuid/dist/esm-node/v35.js");
/* harmony import */ var _md5_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./md5.js */ "./node_modules/uuid/dist/esm-node/md5.js");


const v3 = (0,_v35_js__WEBPACK_IMPORTED_MODULE_0__["default"])('v3', 0x30, _md5_js__WEBPACK_IMPORTED_MODULE_1__["default"]);
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (v3);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/v35.js":
/*!************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/v35.js ***!
  \************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "DNS": () => (/* binding */ DNS),
/* harmony export */   "URL": () => (/* binding */ URL),
/* harmony export */   "default": () => (/* export default binding */ __WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _stringify_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./stringify.js */ "./node_modules/uuid/dist/esm-node/stringify.js");
/* harmony import */ var _parse_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./parse.js */ "./node_modules/uuid/dist/esm-node/parse.js");



function stringToBytes(str) {
  str = unescape(encodeURIComponent(str)); // UTF8 escape

  const bytes = [];

  for (let i = 0; i < str.length; ++i) {
    bytes.push(str.charCodeAt(i));
  }

  return bytes;
}

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
/* harmony default export */ function __WEBPACK_DEFAULT_EXPORT__(name, version, hashfunc) {
  function generateUUID(value, namespace, buf, offset) {
    if (typeof value === 'string') {
      value = stringToBytes(value);
    }

    if (typeof namespace === 'string') {
      namespace = (0,_parse_js__WEBPACK_IMPORTED_MODULE_0__["default"])(namespace);
    }

    if (namespace.length !== 16) {
      throw TypeError('Namespace must be array-like (16 iterable integer values, 0-255)');
    } // Compute hash of namespace and value, Per 4.3
    // Future: Use spread syntax when supported on all platforms, e.g. `bytes =
    // hashfunc([...namespace, ... value])`


    let bytes = new Uint8Array(16 + value.length);
    bytes.set(namespace);
    bytes.set(value, namespace.length);
    bytes = hashfunc(bytes);
    bytes[6] = bytes[6] & 0x0f | version;
    bytes[8] = bytes[8] & 0x3f | 0x80;

    if (buf) {
      offset = offset || 0;

      for (let i = 0; i < 16; ++i) {
        buf[offset + i] = bytes[i];
      }

      return buf;
    }

    return (0,_stringify_js__WEBPACK_IMPORTED_MODULE_1__["default"])(bytes);
  } // Function#name is not settable on some platforms (#270)


  try {
    generateUUID.name = name; // eslint-disable-next-line no-empty
  } catch (err) {} // For CommonJS default export support


  generateUUID.DNS = DNS;
  generateUUID.URL = URL;
  return generateUUID;
}

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/v4.js":
/*!***********************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/v4.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _rng_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./rng.js */ "./node_modules/uuid/dist/esm-node/rng.js");
/* harmony import */ var _stringify_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./stringify.js */ "./node_modules/uuid/dist/esm-node/stringify.js");



function v4(options, buf, offset) {
  options = options || {};
  const rnds = options.random || (options.rng || _rng_js__WEBPACK_IMPORTED_MODULE_0__["default"])(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`

  rnds[6] = rnds[6] & 0x0f | 0x40;
  rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

  if (buf) {
    offset = offset || 0;

    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }

    return buf;
  }

  return (0,_stringify_js__WEBPACK_IMPORTED_MODULE_1__["default"])(rnds);
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (v4);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/v5.js":
/*!***********************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/v5.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _v35_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./v35.js */ "./node_modules/uuid/dist/esm-node/v35.js");
/* harmony import */ var _sha1_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./sha1.js */ "./node_modules/uuid/dist/esm-node/sha1.js");


const v5 = (0,_v35_js__WEBPACK_IMPORTED_MODULE_0__["default"])('v5', 0x50, _sha1_js__WEBPACK_IMPORTED_MODULE_1__["default"]);
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (v5);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/validate.js":
/*!*****************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/validate.js ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _regex_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./regex.js */ "./node_modules/uuid/dist/esm-node/regex.js");


function validate(uuid) {
  return typeof uuid === 'string' && _regex_js__WEBPACK_IMPORTED_MODULE_0__["default"].test(uuid);
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (validate);

/***/ }),

/***/ "./node_modules/uuid/dist/esm-node/version.js":
/*!****************************************************!*\
  !*** ./node_modules/uuid/dist/esm-node/version.js ***!
  \****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _validate_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./validate.js */ "./node_modules/uuid/dist/esm-node/validate.js");


function version(uuid) {
  if (!(0,_validate_js__WEBPACK_IMPORTED_MODULE_0__["default"])(uuid)) {
    throw TypeError('Invalid UUID');
  }

  return parseInt(uuid.substr(14, 1), 16);
}

/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (version);

/***/ }),

/***/ "child_process":
/*!********************************!*\
  !*** external "child_process" ***!
  \********************************/
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("zlib");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
/*!**********************!*\
  !*** ./lib/index.ts ***!
  \**********************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "StaticWado": () => (/* reexport safe */ _StaticWado__WEBPACK_IMPORTED_MODULE_2__["default"]),
/* harmony export */   "createMain": () => (/* reexport default from dynamic */ _createMain__WEBPACK_IMPORTED_MODULE_3___default.a),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   "deleteMain": () => (/* reexport default from dynamic */ _deleteMain__WEBPACK_IMPORTED_MODULE_4___default.a),
/* harmony export */   "mkdicomwebConfig": () => (/* reexport default from dynamic */ _mkdicomwebConfig__WEBPACK_IMPORTED_MODULE_1___default.a)
/* harmony export */ });
/* empty/unused harmony star reexport */
Object(function webpackMissingModule() { var e = new Error("Cannot find module '@radicalimaging/static-wado-util'"); e.code = 'MODULE_NOT_FOUND'; throw e; }());
/* harmony import */ var _mkdicomwebConfig__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./mkdicomwebConfig */ "./lib/mkdicomwebConfig.js");
/* harmony import */ var _mkdicomwebConfig__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_mkdicomwebConfig__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _StaticWado__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./StaticWado */ "./lib/StaticWado.ts");
/* harmony import */ var _createMain__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./createMain */ "./lib/createMain.js");
/* harmony import */ var _createMain__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_createMain__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _deleteMain__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./deleteMain */ "./lib/deleteMain.js");
/* harmony import */ var _deleteMain__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_deleteMain__WEBPACK_IMPORTED_MODULE_4__);





_StaticWado__WEBPACK_IMPORTED_MODULE_2__["default"].mkdicomwebConfig = (_mkdicomwebConfig__WEBPACK_IMPORTED_MODULE_1___default());
_StaticWado__WEBPACK_IMPORTED_MODULE_2__["default"].createMain = (_createMain__WEBPACK_IMPORTED_MODULE_3___default());
_StaticWado__WEBPACK_IMPORTED_MODULE_2__["default"].deleteMain = (_deleteMain__WEBPACK_IMPORTED_MODULE_4___default());
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (_StaticWado__WEBPACK_IMPORTED_MODULE_2__["default"]);

})();

/******/ 	return __webpack_exports__;
/******/ })()
;
});
//# sourceMappingURL=index.umd.js.map