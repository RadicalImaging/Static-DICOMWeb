const paletteColor = require("./paletteColor");

/**
 * Get image frame from dataset
 *
 * @param {*} dataSet naturalized (by dcmjs) data set
 * @param {*} decodedPixelData
 * @returns image frame
 */
function fromDataset(dataSet, decodedPixelData) {
  const bluePaletteColorLookupTableData = paletteColor(dataSet.BluePaletteColorLookupTableData, dataSet.BluePaletteColorLookupTableDescriptor);
  const greenPaletteColorLookupTableData = paletteColor(dataSet.GreenPaletteColorLookupTableData, dataSet.GreenPaletteColorLookupTableDescriptor);
  const redPaletteColorLookupTableData = paletteColor(dataSet.RedPaletteColorLookupTableData, dataSet.RedPaletteColorLookupTableDescriptor);

  return {
    samplesPerPixel: dataSet.SamplesPerPixel,
    photometricInterpretation: dataSet.PhotometricInterpretation,
    planarConfiguration: dataSet.PlanarConfiguration,
    rows: dataSet.Rows,
    columns: dataSet.Columns,
    bitsAllocated: dataSet.BitsAllocated,
    bitsStored: dataSet.BitsStored,
    pixelRepresentation: dataSet.PixelPresentation, // 0 = unsigned,
    smallestPixelValue: dataSet.SmallestImagePixelValue,
    largestPixelValue: dataSet.LargestImagePixelValue,
    bluePaletteColorLookupTableData,
    bluePaletteColorLookupTableDescriptor: dataSet.BluePaletteColorLookupTableDescriptor,
    greenPaletteColorLookupTableData,
    greenPaletteColorLookupTableDescriptor: dataSet.GreenPaletteColorLookupTableDescriptor,
    redPaletteColorLookupTableData,
    redPaletteColorLookupTableDescriptor: dataSet.RedPaletteColorLookupTableDescriptor,
    pixelData: decodedPixelData,
  };
}

module.exports = fromDataset;
