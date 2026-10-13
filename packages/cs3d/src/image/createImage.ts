import { utilities } from '@cornerstonejs/core';
import { IImage } from '@cornerstonejs/core/types';
import { VOILUTFunctionType } from '@cornerstonejs/core/enums';
import * as dcmjs from 'dcmjs';
import { imageFrameUtils } from '../util';

// The metadata has been through a JSON round trip, so a binary value is either base64
// InlineBinary (including values whose VR the creator could not resolve, e.g. implicit VR
// 'US|SS') or decoded numbers. A BulkDataURI cannot be resolved here.
function getLUTBytes(value) {
  if (typeof value?.InlineBinary === 'string') {
    return Buffer.from(value.InlineBinary, 'base64');
  }
  const words = typeof value === 'number' ? [value] : value;
  if (!Array.isArray(words) || !words.every(v => typeof v === 'number')) {
    return;
  }
  const bytes = Buffer.alloc(words.length * 2);
  words.forEach((v, i) => bytes.writeUInt16LE(v & 0xffff, i * 2));
  return bytes;
}

function readUint16Words(bytes) {
  const words = new Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < words.length; i++) {
    words[i] = bytes.readUInt16LE(i * 2);
  }
  return words;
}

// The cornerstone renderer reads a LUT as { firstValueMapped, lut } and spreads `lut`, so
// passing the raw sequence item through fails the whole thumbnail. An item that cannot be
// read returns undefined, which leaves the window center/width (or, for a Modality LUT,
// the rescale) in charge.
// LUT Data entries are always unsigned (US/OW); only the first value mapped follows the
// signedness of the values the LUT is indexed by. 8 bit entries may be stored one per
// byte instead of one per word, which only the data length tells apart.
function toCornerstoneLUT(item, signedInput) {
  const descriptorBytes = getLUTBytes(item?.LUTDescriptor);
  const dataBytes = getLUTBytes(item?.LUTData);
  if (!descriptorBytes || descriptorBytes.length < 6 || !dataBytes) {
    return;
  }
  const [entries, firstValueMapped, numBitsPerEntry] = readUint16Words(descriptorBytes);
  const numLUTEntries = entries || 65536;
  const lut =
    numBitsPerEntry === 8 && dataBytes.length < numLUTEntries * 2
      ? Array.from(dataBytes)
      : readUint16Words(dataBytes);
  if (!lut.length) {
    return;
  }
  // An SS descriptor is always decoded, so a negative value says so on its own.
  const signed = signedInput || item.LUTDescriptor?.[1] < 0;
  return {
    id: '1',
    firstValueMapped:
      signed && firstValueMapped > 0x7fff ? firstValueMapped - 0x10000 : firstValueMapped,
    numBitsPerEntry,
    lut: lut.slice(0, numLUTEntries),
  };
}

// The renderer clamps a Modality LUT at firstValueMapped but then reads lut[storedValue]
// without subtracting it. Padding the front with the first entry makes that read right.
// A negative firstValueMapped cannot be padded and is left as is.
function startModalityLUTAtZero(lut) {
  if (!lut || lut.firstValueMapped <= 0) {
    return lut;
  }
  return {
    ...lut,
    firstValueMapped: 0,
    lut: new Array(lut.firstValueMapped).fill(lut.lut[0]).concat(lut.lut),
  };
}

// The VOI LUT is indexed by the modality LUT output, which can be signed even when the
// stored pixels are not (CT, or a rescale that goes negative). Same rule as
// dicom-image-loader's getModalityLUTOutputPixelRepresentation.
function isModalityOutputSigned(dataSet) {
  const { SOPClassUID, PixelRepresentation, BitsStored } = dataSet;
  if (
    SOPClassUID === '1.2.840.10008.5.1.4.1.1.2' ||
    SOPClassUID === '1.2.840.10008.5.1.4.1.1.2.1'
  ) {
    return true;
  }
  // dcmjs naturalizes an element with no value to null or [], which Number() reads as 0;
  // the loader treats those as absent.
  const decimal = value =>
    value === null || value === undefined || value === '' || Array.isArray(value)
      ? undefined
      : Number(value);
  const intercept = decimal(dataSet.RescaleIntercept);
  const slope = decimal(dataSet.RescaleSlope);
  if (intercept !== undefined && slope !== undefined) {
    const minStoredPixelValue = PixelRepresentation === 1 ? -1 << (BitsStored - 1) : 0;
    return minStoredPixelValue * slope + intercept < 0;
  }
  if (dataSet.ModalityLUTSequence?.length) {
    return false;
  }
  return PixelRepresentation === 1;
}

/**
 * Creates CornerstoneCore image object for already decodedPixel data.
 * It returns an complex object to be used by CS api methods layer.
 *
 * @param {*} transferSyntax
 * @param {*} decodedPixelData
 * @param {*} metadata
 * @param {*} canvas browser canvas (this param is mutate)
 * @param {*} options
 * @returns
 */
export function createImage(
  transferSyntax,
  decodedPixelData,
  metadata,
  canvas,
  options = { convertFloatPixelDataToInt: null, targetBuffer: null }
): IImage {
  // @ts-ignore
  const dataSet = dcmjs.data.DicomMetaDictionary.naturalizeDataset(
    JSON.parse(JSON.stringify(metadata))
  );
  const imageFrame = imageFrameUtils.get.fromDataset(dataSet, decodedPixelData);

  const { convertFloatPixelDataToInt, targetBuffer } = options;

  // If we have a target buffer that was written to in the
  // Decode task, point the image to it here.
  // We can't have done it within the thread incase it was a SharedArrayBuffer.
  const alreadyTyped = imageFrameUtils.convert.pixelDataToTargetBuffer(imageFrame, targetBuffer);
  const originalDataConstructor = imageFrame.pixelData.constructor;

  const {
    ModalityLUTSequence: modalityLUTSequence,
    PixelSpacing: pixelSpacing,
    RescaleIntercept: intercept = 0,
    RescaleSlope: slope = 1,
    VOILUTSequence: voiLUTSequence,
    WindowCenter: windowCenter,
    WindowWidth: windowWidth,
    SOPClassUID: sopClassUID,
    SamplesPerPixel: numberOfComponents,
  } = dataSet;

  const [rowPixelSpacing, columnPixelSpacing] = pixelSpacing || [];
  const isColorImage = imageFrameUtils.is.colorImage(imageFrame);

  // JPEGBaseline (8 bits) is already returning the pixel data in the right format (rgba)
  // because it's using a canvas to load and decode images.
  if (!imageFrameUtils.is.jpegBaseline8BitColor(imageFrame, transferSyntax)) {
    if (!alreadyTyped) {
      imageFrameUtils.convert.pixelDataType(imageFrame);
    }

    // convert color space
    if (isColorImage) {
      const context = canvas.getContext('2d');
      const imageData = context.createImageData(imageFrame.columns, imageFrame.rows);

      // imageData.data is being changed by reference.
      imageFrameUtils.convert.colorSpace(imageFrame, imageData.data);
      if (!imageData.data) {
        throw new Error('Missing image data after converting color space');
      }
      imageFrame.imageData = imageData;
      imageFrame.pixelData = imageData.data;
    }
  }

  if (
    (!imageFrame.smallestPixelValue ||
      !imageFrame.largestPixelValue ||
      imageFrame.pixelData.constructor,
    originalDataConstructor)
  ) {
    // calculate smallest and largest PixelValue of the converted pixelData
    const { min, max } = imageFrameUtils.get.pixelDataMinMax(imageFrame.pixelData);

    imageFrame.smallestPixelValue = min;
    imageFrame.largestPixelValue = max;
  }

  const { columns, rows } = imageFrame;

  const rgba = imageFrame.pixelData.length === rows * columns * 4;
  const image: IImage = {
    imageId: 'internal',
    isPreScaled: imageFrame.preScale,
    color: isColorImage,
    columnPixelSpacing,
    columns,
    height: imageFrame.rows,
    intercept,
    slope,
    invert: imageFrame.photometricInterpretation === 'MONOCHROME1',
    minPixelValue: imageFrame.smallestPixelValue,
    maxPixelValue: imageFrame.largestPixelValue,
    rowPixelSpacing,
    rows,
    sizeInBytes: imageFrame.pixelData.byteLength,
    width: columns,
    voiLUTFunction: VOILUTFunctionType.LINEAR,
    windowCenter,
    windowWidth,
    decodeTimeInMS: imageFrame.decodeTimeInMS,
    getPixelData: null,
    getCanvas: null,
    modalityLUT: null,
    voiLUT: null,
    rgba,
    dataType: null,
    numberOfComponents,
    voxelManager: utilities.VoxelManager.createImageVoxelManager({
      width: columns,
      height: rows,
      scalarData: imageFrame.pixelData,
      numberOfComponents: rgba ? 4 : numberOfComponents,
    }),
  };

  // If pixel data is intrinsically floating 32 array, we convert it to int for
  // display in cornerstone. For other cases when pixel data is typed as
  // Float32Array for scaling; this conversion is not needed.
  if (imageFrame.pixelData instanceof Float32Array && convertFloatPixelDataToInt) {
    const floatPixelData = imageFrame.pixelData;
    const results = imageFrameUtils.get.pixelDataIntType(floatPixelData);

    image.minPixelValue = results.min;
    image.maxPixelValue = results.max;
    image.slope = results.slope;
    image.intercept = results.intercept;
    // image.floatPixelData = floatPixelData
    image.getPixelData = () => results.intPixelData;
  } else {
    image.getPixelData = () => imageFrame.pixelData;
  }

  if (image.color && imageFrame.imageData) {
    // let lastImageIdDrawn;
    image.getCanvas = () => {
      canvas.height = image.rows;
      canvas.width = image.columns;
      const context = canvas.getContext('2d');

      context.putImageData(imageFrame.imageData, 0, 0);

      return canvas;
    };
  }

  // Modality LUT
  if (
    modalityLUTSequence &&
    modalityLUTSequence.length > 0 &&
    imageFrameUtils.is.modalityLut(sopClassUID)
  ) {
    image.modalityLUT = startModalityLUTAtZero(
      toCornerstoneLUT(modalityLUTSequence[0], dataSet.PixelRepresentation === 1)
    );
  }

  // VOI LUT. The renderer looks it up by the modality output without rounding, so a
  // fractional rescale would read between entries and render those pixels as the bottom
  // of the range; the window renders such an image instead.
  const modalityOutputIsInteger =
    image.modalityLUT || (Number.isInteger(Number(slope)) && Number.isInteger(Number(intercept)));
  if (voiLUTSequence && voiLUTSequence.length > 0 && modalityOutputIsInteger) {
    image.voiLUT = toCornerstoneLUT(voiLUTSequence[0], isModalityOutputSigned(dataSet));
  }

  if (image.color) {
    image.windowWidth = 256;
    image.windowCenter = 128;
  }

  // set the ww/wc to cover the dynamic range of the image if no values are supplied
  if (image.windowCenter === undefined || image.windowWidth === undefined) {
    const maxVoi = image.maxPixelValue * image.slope + image.intercept;
    const minVoi = image.minPixelValue * image.slope + image.intercept;

    image.windowWidth = maxVoi - minVoi + 1;
    image.windowCenter = (maxVoi + minVoi + 1) / 2;
  }

  return image;
}

export default createImage;
