const dicomParser = require("dicom-parser");

/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */

const getEncapsulatedImageFrame = (dataSet, attr, frameIndex, framesAreFragmented) => {
  if (dataSet.elements.x7fe00010 && dataSet.elements.x7fe00010.basicOffsetTable.length) {
    // Basic Offset Table is not empty
    return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frameIndex);
  }

  // Empty basic offset table
  if (framesAreFragmented) {
    const basicOffsetTable = dicomParser.createJPEGBasicOffsetTable(dataSet, dataSet.elements.x7fe00010);

    return dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frameIndex, basicOffsetTable);
  }

  return dicomParser.readEncapsulatedPixelDataFromFragments(dataSet, dataSet.elements.x7fe00010, frameIndex);
};

module.exports = getEncapsulatedImageFrame;
