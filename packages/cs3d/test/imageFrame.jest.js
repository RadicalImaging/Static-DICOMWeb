const fromDataset = require("../src/util/imageFrame/get/fromDataset");
const { pixelDataType } = require("../src/util/imageFrame/convert");

describe("fromDataset", () => {
  const mockPixelData = new Uint8Array([0, 1, 2, 3]);

  const baseDataset = {
    Rows: 2,
    Columns: 2,
    BitsAllocated: 16,
    BitsStored: 16,
    SamplesPerPixel: 1,
    PhotometricInterpretation: "MONOCHROME2",
  };

  it("reads PixelRepresentation correctly", () => {
    const dataSet = { ...baseDataset, PixelRepresentation: 1 };
    const result = fromDataset(dataSet, mockPixelData);
    expect(result.pixelRepresentation).toBe(1);
  });

  it("defaults PixelRepresentation to 0 when absent", () => {
    const result = fromDataset(baseDataset, mockPixelData);
    expect(result.pixelRepresentation).toBe(0);
  });
});

describe("pixelDataType", () => {
  it("converts to Int16Array for signed 16-bit data", () => {
    const imageFrame = {
      bitsAllocated: 16,
      pixelRepresentation: 1,
      pixelData: new Uint8Array([0, 0, 255, 255]).buffer,
    };
    pixelDataType(imageFrame);
    expect(imageFrame.pixelData).toBeInstanceOf(Int16Array);
  });

  it("converts to Uint16Array for unsigned 16-bit data", () => {
    const imageFrame = {
      bitsAllocated: 16,
      pixelRepresentation: 0,
      pixelData: new Uint8Array([0, 0, 255, 255]).buffer,
    };
    pixelDataType(imageFrame);
    expect(imageFrame.pixelData).toBeInstanceOf(Uint16Array);
  });
});
