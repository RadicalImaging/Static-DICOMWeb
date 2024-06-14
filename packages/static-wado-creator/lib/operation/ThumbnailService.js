const path = require("path");
const glob = require("glob");
const fs = require("fs");
const { Tags, execSpawn, Stats } = require("@radicalimaging/static-wado-util");
const { shouldThumbUseTranscoded } = require("./adapter/transcodeImage");

/**
 * Return the middle index of given list
 * @param {*} listThumbs
 * @returns
 */
function getThumbIndex(listThumbs) {
  return Math.trunc(listThumbs / 2);
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
    execSpawn(`ffmpeg -i "${input}" -vf  "thumbnail,scale=640:360" -frames:v 1 -f singlejpeg "${output}"`);
  }

  dcm2jpg(input, output, options) {
    const script = ["dcm2jpg", `"${input}" "${output}"`];
    if (options?.format) {
      script.push("-F", options.format);
    }
    execSpawn(script.join(" "));
  }

  /** Generates a rendered copy of this, assuming --rendered is set.
   * Requires dcm2jpg to be available.
   */
  async generateRendered(itemid, dataSet, metadata, callback, options) {
    if (!options.rendered) {
      return null;
    }
    const { id } = this.favoriteThumbnailObj;
    const rendered = id.imageFrameRootPath.replace(/frames/, "rendered");
    return this.dcm2jpg(id.filename, rendered, { format: "png" });
  }

  /**
   * Generates thumbnails for the levels: instances, series, study.  This is asynchronous
   *
   * @param {*} dataSet
   * @param {*} metadata
   * @param {*} callback
   */
  async generateThumbnails(itemId, dataSet, metadata, callback, options) {
    const { imageFrame, id } = this.favoriteThumbnailObj;

    // There are various reasons no thumbnails might be generated, so just return
    if (!id) {
      const pixelData = metadata[Tags.PixelData];
      if (pixelData) {
        const { BulkDataURI } = pixelData;
        if (BulkDataURI?.indexOf("mp4")) {
          fs.mkdirSync(`${itemId.sopInstanceRootPath}/rendered`, { recursive: true });
          const mp4Path = path.join(itemId.sopInstanceRootPath, "rendered/index.mp4");
          // Generate as rendered, as more back ends support that.
          const thumbPath = path.join(itemId.sopInstanceRootPath, "rendered/1.jpg");
          console.log("MP4 - converting video format", mp4Path);
          this.ffmpeg(mp4Path, thumbPath);
          return thumbPath;
        }
      } else {
        console.log("Series is of other type...", metadata[Tags.Modality]);
      }
      return null;
    }

    if (!options.thumb) {
      return null;
    }

    if (options.dcm2jpg) {
      return this.dcm2jpg(id.filename, id.imageFrameRootPath.replace(/frames/, "thumbnail"), {});
    }

    await callback.internalGenerateImage(imageFrame, dataSet, metadata, id.transferSyntaxUid, async (thumbBuffer) => {
      try {
        if (thumbBuffer) {
          await callback.thumbWriter(id.sopInstanceRootPath, this.thumbFileName, thumbBuffer);

          this.copySyncThumbnail(id.sopInstanceRootPath, id.seriesRootPath);
          this.copySyncThumbnail(id.seriesRootPath, id.studyPath);
          Stats.StudyStats.add("Thumbnail Write", `Write thumbnail ${this.thumbFileName}`, 100);
        }
        return this.thumbFileName;
      } catch (e) {
        console.log("Couldn't generate thumbnail", this.thumbFileName, e);
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
