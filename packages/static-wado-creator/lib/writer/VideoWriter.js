/** Write raw video file */
const Tags = require("../dictionary/Tags");
const WriteStream = require("./WriteStream");

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
  "1.2.840.10008.1.2.4.108": H265,
  // TODO - add the new multi-segment MPEG2 and H264 variants
};

const isVideo = (value) => VIDEO_TYPES[value && value.string ? value.string(Tags.RawTransferSyntaxUID) : value];

const VideoWriter = () =>
  async function run(id, dataSet) {
    console.log(`Writing video  ${id.sopInstanceUid}`);
    const extension = VIDEO_TYPES[dataSet.string(Tags.RawTransferSyntaxUID)];
    const filename = `pixeldata.${extension}`;
    const writeStream = WriteStream(id.sopInstanceRootPath, filename, {
      mkdir: true,
    });
    let length = 0;
    const { fragments } = dataSet.elements.x7fe00010;

    if (!fragments) {
      console.warn("No video data");
      return "";
    }
    // The zero position fragment isn't available, even though present in the original data
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
