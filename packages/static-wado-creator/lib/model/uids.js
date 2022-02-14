const octetStream = "application/octet-stream";
const uncompressed = {
  uncompressed: true,
  gzip: true,
  contentType: octetStream,
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
  "1.2.840.10008.1.2.4.50": { contentType: jpeg, lossy: true },
  "1.2.840.10008.1.2.4.51": { contentType: jpeg, lossy: true },
  "1.2.840.10008.1.2.4.57": { contentType: jpeg },
  "1.2.840.10008.1.2.4.70": { contentType: jll },
  "1.2.840.10008.1.2.4.140": { contentType: jxl },
  "1.2.840.10008.1.2.4.141": { contentType: jxl, lossy: true },
  "1.2.840.10008.1.2.4.80": { contentType: jls },
  "1.2.840.10008.1.2.4.81": { contentType: jls, lossy: true },
  "1.2.840.10008.1.2.4.90": { contentType: jp2 },
  "1.2.840.10008.1.2.4.91": { contentType: jp2 },
  // From JPEG original data, lossless to JXL
  "1.2.840.10008.1.2.4.142": { contentType: jxl, lossy: true },
  "1.2.840.10008.1.2.4.150": { contentType: htj2k },
  // **
  "1.2.840.10008.1.2.5": { contentType: rle },
  default: {},
};

module.exports = uids;
