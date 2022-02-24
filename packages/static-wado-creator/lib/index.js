const dicomCodec = require("@cornerstonejs/dicom-codec");
const { program, Stats, handleHomeRelative } = require("@ohif/static-wado-util");
const dicomParser = require("dicom-parser");
const fs = require("fs");
const path = require("path");
const { dirScanner } = require("@ohif/static-wado-util");
const asyncIterableToBuffer = require("./operation/adapter/asyncIterableToBuffer");
const getDataSet = require("./operation/getDataSet");
const InstanceDeduplicate = require("./operation/InstanceDeduplicate");
const DeduplicateWriter = require("./writer/DeduplicateWriter");
const ImageFrameWriter = require("./writer/ImageFrameWriter");
const CompleteStudyWriter = require("./writer/CompleteStudyWriter");
const IdCreator = require("./util/IdCreator");
const ScanStudy = require("./operation/ScanStudy");
const HashDataWriter = require("./writer/HashDataWriter");
const VideoWriter = require("./writer/VideoWriter");
const { transcodeImageFrame, transcodeId, transcodeMetadata } = require("./operation/adapter/transcodeImage");
const staticWadoConfig = require("./staticWadoConfig.js");

class StaticWado {
  constructor(defaults) {
    const { scanStudies } = defaults;

    const {
      maximumInlinePublicLength,
      maximumInlinePrivateLength,
      group: isGroup,
      instances: isInstanceMetadata,
      deduplicate: isDeduplicate,
      study: isStudyData,
      clean: isClean,
      recompress,
      contentType,
      colourContentType,
      dir = defaults.rootDir || "~/dicomweb",
      pathDeduplicated = defaults.pathDeduplicated || "deduplicated",
      pathInstances = "instances",
      removeDeduplicatedInstances,
      verbose = false,
    } = program.opts();

    dicomCodec.setConfig({ verbose });

    const directoryName = handleHomeRelative(dir);

    this.options = {
      TransferSyntaxUID: "1.2.840.10008.1.2",
      maximumInlinePublicLength,
      maximumInlinePrivateLength,
      isGroup,
      isInstanceMetadata,
      isDeduplicate,
      isStudyData,
      isClean,
      recompressType: recompress || "",
      contentType,
      colourContentType,
      directoryName,
      deduplicatedRoot: path.join(directoryName, pathDeduplicated),
      deduplicatedInstancesRoot: path.join(directoryName, pathInstances),
      removeDeduplicatedInstances,
      scanStudies,
      verbose,
    };

    // currently there is only one type of args, so all arg values mean input data (directories/files)
    this.input = program.args;
    this.callback = {
      uids: IdCreator(this.options),
      bulkdata: HashDataWriter(this.options),
      imageFrame: ImageFrameWriter(this.options),
      videoWriter: VideoWriter(this.options),
      completeStudy: CompleteStudyWriter(this.options),
      metadata: InstanceDeduplicate(this.options),
      deduplicated: DeduplicateWriter(this.options),
      scanStudy: ScanStudy(this.options),
    };
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
          await this.importBinaryDicom(dicomp10stream, params);
          Stats.StudyStats.add("DICOM P10", "Parse DICOM P10 file");
        } catch (e) {
          console.error("Couldn't process", file, e);
        }
      },
    });
  }

  /**
   * Processes a study directory, matching up study instance UIDs.  Either processes the
   * deduplicated group directory or the instances directory, or the notifications directory.
   * @param {*} params
   */
  async processStudyDir(studyUids, params) {
    return dirScanner(params[params.scanStudies], {
      ...params,
      recursive: false,
      callback: (dir, name) => this.callback.scanStudy(dir, name),
    });
  }

  async importBinaryDicom(dicomp10stream, params) {
    // Read dicomp10 stream into buffer
    const buffer = await asyncIterableToBuffer(dicomp10stream);

    // Parse it
    const dataSet = dicomParser.parseDicom(buffer, params);

    const studyInstanceUid = dataSet.string("x0020000d");

    if (!studyInstanceUid) {
      console.log(`Can't import file`);
      return undefined;
    }

    // Extract uids
    const id = this.callback.uids({
      studyInstanceUid,
      seriesInstanceUid: dataSet.string("x0020000e"),
      sopInstanceUid: dataSet.string("x00080018"),
      transferSyntaxUid: dataSet.string("x00020010"),
    });

    const targetId = transcodeId(id, this.options);

    let bulkDataIndex = 0;
    let imageFrameIndex = 0;
    const generator = {
      bulkdata: async (bulkData) => {
        const _bulkDataIndex = bulkDataIndex;
        bulkDataIndex += 1;
        return this.callback.bulkdata(targetId, _bulkDataIndex, bulkData);
      },
      imageFrame: async (originalImageFrame) => {
        const { imageFrame, id: transcodedId } = await transcodeImageFrame(id, targetId, originalImageFrame, dataSet, this.options);

        const currentImageFrameIndex = imageFrameIndex;
        imageFrameIndex += 1;

        return this.callback.imageFrame(transcodedId, currentImageFrameIndex, imageFrame);
      },
      videoWriter: async (_dataSet) => this.callback.videoWriter(id, _dataSet),
    };

    // convert to DICOMweb MetaData and BulkData
    const result = await getDataSet(dataSet, generator, this.options);

    const transcodedMeta = transcodeMetadata(result.metadata, id, this.options);

    await this.callback.metadata(targetId, transcodedMeta);

    // resolve promise with statistics
    return {};
  }

  /**
   * The mkdicomweb command first runs mkdicomwebinstances, writing out the deduplicated data, and then runs the
   * mkdicomwebstudy command, creating the deduplicated data set.  This version, however, keeps the deduplicated
   * data in memory by default on a study level, which avoids needing to run the load process.
   */
  async main() {
    if (this.options.scanStudies) {
      // Scan one of the study directories - in this case, files is a set of study directories
      await this.processStudyDir(this.input, this.options);
    } else {
      await this.processFiles(this.input, this.options);
    }
    await this.close();
  }

  async close() {
    await this.callback.completeStudy();
    Stats.OverallStats.summarize("Completed Study Processing");
  }

  static main(defaults) {
    const importer = new StaticWado(defaults);
    return importer.main();
  }
}

StaticWado.staticWadoConfig = staticWadoConfig;

module.exports = StaticWado;
