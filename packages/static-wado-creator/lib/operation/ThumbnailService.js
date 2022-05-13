const path = require("path");
const glob = require("glob");
const dicomCodec = require("@cornerstonejs/dicom-codec");
const staticCS = require("@ohif/static-cs-lite");
const fs = require("fs");
const { exec } = require("child_process");
const decodeImage = require("./adapter/decodeImage");
const { shouldThumbUseTranscoded } = require("./adapter/transcodeImage");
const { isVideo } = require("../writer/VideoWriter");
const Tags = require("../dictionary/Tags");

/**
 * Return the middle index of given list
 * @param {*} listThumbs
 * @returns
 */
function getThumbIndex(listThumbs) {
  return Math.trunc(listThumbs / 2);
}
function internalGenerateThumbnail(originalImageFrame, dataset, metadata, transferSyntaxUid, doneCallback) {
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
    const { id, imageFrame, transcodedId, transcodedImageFrame, frameIndex } = thumbObjWrapper;
    const getThumbContent = (originalContent, trancodedContent) => (shouldThumbUseTranscoded(id, programOpts) ? trancodedContent : originalContent);

    const thumbObj = {
      imageFrame: getThumbContent(imageFrame, transcodedImageFrame),
      id: getThumbContent(id, transcodedId),
      frameIndex,
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
    const { imageFrame, id } = this.favoriteThumbnailObj;

    // There are various reasons no thumbnails might be generated, so just return
    if (!id) {
      const pixelData = metadata[Tags.PixelData];
      if (pixelData) {
        const { BulkDataURI } = pixelData;
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
    internalGenerateThumbnail(imageFrame, dataSet, metadata, id.transferSyntaxUid, async (thumbBuffer) => {
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
