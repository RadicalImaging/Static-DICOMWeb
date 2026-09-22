const { Tags } = require('@radicalimaging/static-wado-util');
/**
 * Minimum image info data to be used on transcode process by dicom-codec api.
 */
function getImageInfo(dataSet, instance) {
  if (instance) {
    const rows = Tags.getValue(instance, Tags.Rows);
    const columns = Tags.getValue(instance, Tags.Columns);
    const bitsAllocated = Tags.getValue(instance, Tags.BitsAllocated);
    const samplesPerPixel = Tags.getValue(instance, Tags.SamplesPerPixel);
    const pixelRepresentation = Tags.getValue(instance, Tags.PixelRepresentation) || 0; // not yet being used.

    return {
      bitsAllocated,
      samplesPerPixel,
      rows, // Number with the image rows/height
      columns, // Number with the image columns/width,
      signed: pixelRepresentation === 1,
      pixelRepresentation,
      // Not used by the codecs (adaptImageInfo drops them), but needed to interpret a stored
      // sample and to keep padding out of a filtered reduction - see createPixelValueModel.
      bitsStored: Tags.getValue(instance, Tags.BitsStored),
      highBit: Tags.getValue(instance, Tags.HighBit),
      pixelPaddingValue: Tags.getValue(instance, Tags.PixelPaddingValue),
      pixelPaddingRangeLimit: Tags.getValue(instance, Tags.PixelPaddingRangeLimit),
      sopClassUid: Tags.getValue(instance, Tags.SOPClassUID),
      segmentationType: Tags.getValue(instance, Tags.SegmentationType),
    };
  }
  const rows = dataSet.uint16('x00280010');
  const columns = dataSet.uint16('x00280011');
  const bitsAllocated = dataSet.uint16('x00280100');
  const samplesPerPixel = dataSet.uint16('x00280002');
  const pixelRepresentation = dataSet.uint16('x00280103') || 0; // not yet being used.

  return {
    bitsAllocated,
    samplesPerPixel,
    rows, // Number with the image rows/height
    columns, // Number with the image columns/width,
    signed: pixelRepresentation === 1,
    pixelRepresentation,
    bitsStored: dataSet.uint16('x00280101'),
    highBit: dataSet.uint16('x00280102'),
    // Padding is US or SS according to PixelRepresentation, so read it accordingly
    pixelPaddingValue:
      pixelRepresentation === 1 ? dataSet.int16('x00280120') : dataSet.uint16('x00280120'),
    pixelPaddingRangeLimit:
      pixelRepresentation === 1 ? dataSet.int16('x00280121') : dataSet.uint16('x00280121'),
    sopClassUid: dataSet.string('x00080016'),
    segmentationType: dataSet.string('x00620001'),
  };
}

module.exports = getImageInfo;
