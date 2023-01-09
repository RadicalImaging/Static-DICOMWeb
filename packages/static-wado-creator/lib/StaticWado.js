const childProcess = require("child_process");
const util = require("util");

const dicomCodec = require("@cornerstonejs/dicom-codec");
const { Stats, handleHomeRelative } = require("@radicalimaging/static-wado-util");
const dicomParser = require("dicom-parser");
const fs = require("fs");
const path = require("path");
const { dirScanner, JSONReader, JSONWriter, asyncIterableToBuffer } = require("@radicalimaging/static-wado-util");
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
const ThumbnailWriter = require("./writer/ThumbnailWriter");
const ThumbnailService = require("./operation/ThumbnailService");
const DeleteStudy = require("./DeleteStudy");
const RejectInstance = require("./RejectInstance");
const RawDicomWriter = require("./writer/RawDicomWriter");

const exec = util.promisify(childProcess.exec);

function setStudyData(studyData) {
  this.studyData = studyData;
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
      TransferSyntaxUID: "1.2.840.10008.1.2",
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
    };
  }

  /**
   * Rejects the given item, specified as studies/<studyUID>/series/<seriesUID>
   * Does NOT remove any files, but adds a flag to the study indicating the deleted series and instances.
   *
   * @param {string} args listing the instances to remove (may remove entire series)
   */
  async reject(args) {
    args.forEach((removal) => {
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
      console.log(`Can't import file ${params.file}`);
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

    const targetId = transcodeId(id, this.options);

    let bulkDataIndex = 0;
    let imageFrameIndex = 0;
    let thumbnailService = null;
    if (this.options.geneateThumbnail) {
      thumbnailService = new ThumbnailService();
    }

    const generator = {
      bulkdata: async (bulkData, options) => {
        const _bulkDataIndex = bulkDataIndex;
        bulkDataIndex += 1;
        return this.callback.bulkdata(targetId, _bulkDataIndex, bulkData, options);
      },
      imageFrame: async (originalImageFrame) => {
        const { imageFrame: transcodedImageFrame, id: transcodedId } = await transcodeImageFrame(id, targetId, originalImageFrame, dataSet, this.options);

        const currentImageFrameIndex = imageFrameIndex;
        imageFrameIndex += 1;

        if (this.options.geneateThumbnail) {
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
        }

        return this.callback.imageFrame(transcodedId, currentImageFrameIndex, transcodedImageFrame);
      },
      videoWriter: async (_dataSet) => this.callback.videoWriter(id, _dataSet),
    };

    // convert to DICOMweb MetaData and BulkData
    const result = await getDataSet(dataSet, generator, this.options);

    await this.callback.rawDicomWriter?.(id, result, buffer);

    const transcodedMeta = transcodeMetadata(result.metadata, id, this.options);

    if (this.options.geneateThumbnail) {
      thumbnailService.generateThumbnails(id, dataSet, transcodedMeta, this.callback);
    }

    await this.callback.metadata(targetId, transcodedMeta);

    // resolve promise with statistics
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

    if (this.options.isAutoDeployS3) {
      const { rootDir, s3ClientDir, s3RgBucket, s3CgBucket, s3EnvAccount, s3EnvRegion } = this.options;
      const command = `deploydicomweb -rd "${rootDir}" -s3cd "${s3ClientDir}" -s3rgb "${s3RgBucket}" -s3cgb "${s3CgBucket}" -s3ea "${s3EnvAccount}" -s3er "${s3EnvRegion}"`;
      console.log({ command });
      const { stdout, stderr } = await exec(command);

      console.log("Rejected output:", stdout, stderr);
    }

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
