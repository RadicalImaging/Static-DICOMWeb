const dicomCodec = require("@cornerstonejs/dicom-codec");
const staticCS = require("@radicalimaging/static-cs-lite");
const { Stats, handleHomeRelative, dirScanner, JSONReader, JSONWriter, asyncIterableToBuffer, Tags } = require("@radicalimaging/static-wado-util");
const dicomParser = require("dicom-parser");
const fs = require("fs");
const path = require("path");
const { NotificationService } = require("@radicalimaging/static-wado-util");
const getDataSet = require("./operation/getDataSet");
const InstanceDeduplicate = require("./operation/InstanceDeduplicate");
const DeduplicateWriter = require("./writer/DeduplicateWriter");
const ImageFrameWriter = require("./writer/ImageFrameWriter");
const WriteStream = require("./writer/WriteStream");
const CompleteStudyWriter = require("./writer/CompleteStudyWriter");
const IdCreator = require("./util/IdCreator");
const ScanStudy = require("./operation/ScanStudy");
const HashDataWriter = require("./writer/HashDataWriter");
const VideoWriter = require("./writer/VideoWriter");
const { transcodeImageFrame, generateLossyImage, transcodeId, transcodeMetadata } = require("./operation/adapter/transcodeImage");
const ThumbnailWriter = require("./writer/ThumbnailWriter");
const decodeImage = require("./operation/adapter/decodeImage");
const ThumbnailService = require("./operation/ThumbnailService");
const DeleteStudy = require("./DeleteStudy");
const RejectInstance = require("./RejectInstance");
const RawDicomWriter = require("./writer/RawDicomWriter");
const { isVideo } = require("./writer/VideoWriter");

function setStudyData(studyData) {
  this.studyData = studyData;
}

function internalGenerateImage(originalImageFrame, dataset, metadata, transferSyntaxUid, doneCallback) {
  decodeImage(originalImageFrame, dataset, transferSyntaxUid)
    .then((decodeResult = {}) => {
      if (isVideo(transferSyntaxUid)) {
        console.log("Video data - no thumbnail generator yet");
      } else {
        const { imageFrame, imageInfo } = decodeResult;
        const pixelData = dicomCodec.getPixelData(imageFrame, imageInfo, transferSyntaxUid);
        staticCS.getRenderedBuffer(transferSyntaxUid, pixelData, metadata, doneCallback);
      }
    })
    .catch((error) => {
      console.log(`Error while generating thumbnail:: ${error}`);
    });
}

class StaticWado {
  constructor(configuration) {
    const { rootDir = "~/dicomweb", pathDeduplicated = "deduplicated", pathInstances = "instances", verbose } = configuration;

    dicomCodec.setConfig({ verbose });
    const directoryName = handleHomeRelative(rootDir);

    this.options = {
      ...configuration,
      directoryName,
      deduplicatedRoot: path.join(directoryName, pathDeduplicated),
      deduplicatedInstancesRoot: path.join(directoryName, pathInstances),
      // TODO - make this configurable and auto-detect by updating the parseDicom library
      TransferSyntaxUID: "1.2.840.10008.1.2.1",
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
      setStudyData,
      rawDicomWriter: RawDicomWriter(this.options),
      notificationService: new NotificationService(this.options.notificationDir),
      internalGenerateImage,
    };
  }

  /**
   * Rejects the given item, specified as studies/<studyUID>/series/<seriesUID>
   * Does NOT remove any files, but adds a flag to the study indicating the deleted series and instances.
   *
   * @param {string} args listing the instances to remove (may remove entire series)
   */
  async reject(studyUID, seriesUID, reason) {
    this.callback.reject(studyUID, seriesUID, reason);
  }

  /**
   * Deletes a study, as specified by the study instance UID by removing instance, deduplicated and studies files,
   * as well as removing the object from the studies list.
   *
   * @param {string[]} args listing the studies to remove
   */
  async delete(args) {
    args.forEach((studyUID) => this.callback.delete(studyUID));
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
    return dirScanner(files, {
      ...params,
      callback: async (file) => {
        try {
          const dicomp10stream = fs.createReadStream(file);
          await this.importBinaryDicom(dicomp10stream, { ...params, file });
          Stats.StudyStats.add("DICOM P10", "Parse DICOM P10 file");
        } catch (e) {
          console.error("Couldn't process", file);
          console.verbose("Error", e);
        }
      },
    });
  }

  /**
   * Processes a study directory, matching up study instance UIDs.  Either processes the
   * deduplicated group directory or the instances directory, or the notifications directory.
   * @param {*} options
   */
  async processStudyDir(studyUids /* , options */) {
    for (const studyUid of studyUids) {
      const study = await this.callback.scanStudy(studyUid);
      console.log("Processed study", study.studyInstanceUid);
    }
  }

  async importBinaryDicom(dicomp10stream, params) {
    // Read dicomp10 stream into buffer
    const buffer = await asyncIterableToBuffer(dicomp10stream);

    // Parse it
    const dataSet = dicomParser.parseDicom(buffer, params);

    const studyInstanceUid = dataSet.string("x0020000d");

    if (!studyInstanceUid) {
      console.log("No study UID, can't import file", params.file, dataSet.elements);
      return undefined;
    }

    // Extract uids
    const id = this.callback.uids(
      {
        studyInstanceUid,
        seriesInstanceUid: dataSet.string("x0020000e"),
        sopInstanceUid: dataSet.string("x00080018"),
        transferSyntaxUid: dataSet.string("x00020010"),
      },
      params.file
    );

    const targetId = transcodeId(id, this.options, dataSet.uint16(Tags.RawSamplesPerPixel));

    let bulkDataIndex = 0;
    let imageFrameIndex = 0;
    const thumbnailService = new ThumbnailService();

    const generator = {
      bulkdata: async (bulkData, options) => {
        const _bulkDataIndex = bulkDataIndex;
        bulkDataIndex += 1;
        // TODO - handle other types here too as single part rendered
        if (options?.mimeType === "application/pdf") {
          console.log("Writing rendered mimeType", options.mimeType);
          const writeStream = WriteStream(id.sopInstanceRootPath, "rendered.pdf", {
            gzip: false,
            mkdir: true,
          });
          await writeStream.write(bulkData);
          await writeStream.close();
        }
        return this.callback.bulkdata(targetId, _bulkDataIndex, bulkData, options);
      },
      imageFrame: async (originalImageFrame) => {
        const { imageFrame: transcodedImageFrame, decoded, id: transcodedId } = await transcodeImageFrame(id, targetId, originalImageFrame, dataSet, this.options);

        const lossyImage = await generateLossyImage(id, decoded, this.options);

        const currentImageFrameIndex = imageFrameIndex;
        imageFrameIndex += 1;

        if (lossyImage) {
          await this.callback.imageFrame(lossyImage.id, currentImageFrameIndex, lossyImage.imageFrame);
        }

        thumbnailService.queueThumbnail(
          {
            imageFrame: originalImageFrame,
            transcodedImageFrame,
            transcodedId,
            id,
            frameIndex: currentImageFrameIndex,
          },
          this.options
        );

        return this.callback.imageFrame(transcodedId, currentImageFrameIndex, transcodedImageFrame);
      },
      videoWriter: async (_dataSet) => this.callback.videoWriter(id, _dataSet),
    };

    // convert to DICOMweb MetaData and BulkData
    const result = await getDataSet(dataSet, generator, this.options);

    await this.callback.rawDicomWriter?.(id, result, buffer);

    const transcodedMeta = transcodeMetadata(result.metadata, id, this.options);
    await thumbnailService.generateThumbnails(id, dataSet, transcodedMeta, this.callback, this.options);
    await thumbnailService.generateRendered(id, dataSet, transcodedMeta, this.callback, this.options);
    await this.callback.metadata(targetId, transcodedMeta);

    // resolve promise with statistics
    return {};
  }

  static async getDataSet(dataSet, generator, params) {
    return getDataSet(dataSet, generator, params);
  }

  static internalGenerateImage(originalImageFrame, dataSet, metadata, transferSyntaxUid, doneCallback) {
    return internalGenerateImage(originalImageFrame, dataSet, metadata, transferSyntaxUid, doneCallback);
  }

  /**
   * The mkdicomweb command first runs mkdicomwebinstances, writing out the deduplicated data, and then runs the
   * mkdicomwebstudy command, creating the deduplicated data set.  This version, however, keeps the deduplicated
   * data in memory by default on a study level, which avoids needing to run the load process.
   */
  async executeCommand(input) {
    if (this.options.scanStudies) {
      console.log("Scanning study dir", input);
      // Scan one of the study directories - in this case, files is a set of study directories
      await this.processStudyDir(input, this.options);
    } else {
      console.log("Scanning files", input);
      await this.processFiles(input, this.options);
    }
    await this.close();
  }

  async close() {
    await this.callback.completeStudy(this.callback);
    Stats.OverallStats.summarize("Completed Study Processing");
  }

  async reindex() {
    const { directoryName } = this.options;
    const studiesDir = `${directoryName}/studies/`;

    console.log("Re-indexing", studiesDir);
    const dirs = await fs.promises.readdir(studiesDir);
    const studies = [];
    for (const dir of dirs) {
      const study = await JSONReader(`${studiesDir}/${dir}`, "index.json.gz", null);
      if (study === null) {
        console.log("No study found in", dir);
        continue;
      }
      console.log("Adding study", dir);
      studies.push(...study);
    }
    return JSONWriter(directoryName, "studies", studies);
  }
}
module.exports = StaticWado;
