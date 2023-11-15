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
const htj2k = "image/jphc";
const jp2 = "image/jp2";
const rle = "image/dicom-rle";

const uids = {
  "1.2.840.10008.1.2": uncompressed,
  "1.2.840.10008.1.2.1": uncompressed,
  "1.2.840.10008.1.2.1.99": uncompressed,
  "1.2.840.10008.1.2.2": uncompressed,
  "1.2.840.10008.1.2.4.50": { contentType: jpeg, lossy: true, extension: ".jpeg" },
  "1.2.840.10008.1.2.4.51": { contentType: jpeg, lossy: true },
  "1.2.840.10008.1.2.4.57": { contentType: jpeg },
  "1.2.840.10008.1.2.4.70": { contentType: jll, extension: ".jll" },
  "1.2.840.10008.1.2.4.140": { contentType: jxl, extension: ".jxl" },
  // Lossy, original JPEG reconstruction mode
  "1.2.840.10008.1.2.4.141": { contentType: jxl, lossy: true },
  "1.2.840.10008.1.2.4.142": { contentType: jxl, lossy: true },
  "1.2.840.10008.1.2.4.80": { contentType: jls, extension: ".jls" },
  "1.2.840.10008.1.2.4.81": { contentType: jls, lossy: true },
  "1.2.840.10008.1.2.4.90": { contentType: jp2, extension: ".jp2" },
  "1.2.840.10008.1.2.4.91": { contentType: jp2 },
  // Private/test transfer syntax for HTJ2K
  "3.2.840.10008.1.2.4.96": { contentType: htj2k },
  "1.2.840.10008.1.2.4.201": { contentType: htj2k },
  "1.2.840.10008.1.2.4.202": { contentType: htj2k, extension: ".jhc" },
  "1.2.840.10008.1.2.4.203": { contentType: htj2k, lossy: true },
  "1.2.840.10008.1.2.5": { contentType: rle },
  default: {},
};

module.exports = uids;
