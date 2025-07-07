const { Tags } = require("@radicalimaging/static-wado-util");
/**
 * Minimum image info data to be used on transcode process by dicom-codec api.
 */
function getImageInfo(dataSet, instance) {
  if (instance || !dataSet.uint16) {
    instance ||= dataSet;
    const rows = Tags.getValue(instance, Tags.Rows);
    const columns = Tags.getValue(instance, Tags.Columns);
    const bitsAllocated = Tags.getValue(instance, Tags.BitsAllocated);
    const samplesPerPixel = Tags.getValue(instance, Tags.SamplesPerPixel);
    const pixelRepresentation =
      Tags.getValue(instance, Tags.PixelRepresentation) || 0; // not yet being used.

    return {
      bitsAllocated,
      samplesPerPixel,
      rows, // Number with the image rows/height
      columns, // Number with the image columns/width,
      signed: pixelRepresentation === 1,
      pixelRepresentation,
    };
  }
  const rows = dataSet.uint16("x00280010");
  const columns = dataSet.uint16("x00280011");
  const bitsAllocated = dataSet.uint16("x00280100");
  const samplesPerPixel = dataSet.uint16("x00280002");
  const pixelRepresentation = dataSet.uint16("x00280103") || 0; // not yet being used.

  return {
    bitsAllocated,
    samplesPerPixel,
    rows, // Number with the image rows/height
    columns, // Number with the image columns/width,
    signed: pixelRepresentation === 1,
    pixelRepresentation,
  };
}

module.exports = getImageInfo;
