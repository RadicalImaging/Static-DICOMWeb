import { utilities } from '@cornerstonejs/core';
import { IImage } from '@cornerstonejs/core/types';
import { VOILUTFunctionType } from '@cornerstonejs/core/enums';
import * as dcmjs from 'dcmjs';
import { imageFrameUtils } from '../util';

/**
 * Reads a binary LUT attribute as bytes. After the JSON round trip of the metadata, the
 * value is base64 InlineBinary (also for a VR the creator could not resolve, such as
 * implicit VR 'US|SS') or decoded numbers.
 *
 * @param value naturalized LUT Descriptor or LUT Data value
 * @returns the little endian bytes, or undefined for a BulkDataURI or another shape
 */
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

/**
 * Converts a naturalized Modality or VOI LUT Sequence item into the LUT shape of the
 * cornerstone renderer, which spreads `lut` and so fails on the raw item.
 * LUT entries are unsigned (US/OW); only the first value mapped can be signed.
 * 8 bit entries are stored one per byte or one per word; the data length tells which.
 *
 * @param item naturalized sequence item
 * @param signedInput whether the values that index the LUT are signed
 * @returns the LUT, or undefined when the item cannot be read, so that the window
 *   center/width (or, for a Modality LUT, the rescale) applies
 */
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

/**
 * Moves a Modality LUT to start at 0. The renderer clamps at firstValueMapped but then
 * reads lut[storedValue] without subtracting it, so the front is padded with the first
 * entry. A negative firstValueMapped cannot be padded and is left as is.
 *
 * @param lut converted Modality LUT, or undefined
 * @returns the LUT starting at 0, or the input unchanged
 */
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

/**
 * Reads a DS value as a number. dcmjs naturalizes an element with no value to null or
 * [], which Number() would read as 0; the loader treats those as absent.
 *
 * @returns the number, or undefined when the element has no value
 */
function decimal(value) {
  return value === null || value === undefined || value === '' || Array.isArray(value)
    ? undefined
    : Number(value);
}

/**
 * Tells whether the values that index the VOI LUT, the output of the modality
 * transform, are signed. They can be signed when the stored pixels are not (CT, or a
 * rescale that goes negative). An applied Modality LUT decides first, because the
 * renderer uses it in place of the rescale and its entries are unsigned. The other rules
 * are those of dicom-image-loader's getModalityLUTOutputPixelRepresentation.
 *
 * @param dataSet naturalized metadata of the image
 * @param modalityLUT the Modality LUT that the image applies, if any
 * @returns true when the modality output is signed
 */
function isModalityOutputSigned(dataSet, modalityLUT) {
  if (modalityLUT) {
    return false;
  }
  const { SOPClassUID, PixelRepresentation, BitsStored } = dataSet;
  if (
    SOPClassUID === '1.2.840.10008.5.1.4.1.1.2' ||
    SOPClassUID === '1.2.840.10008.5.1.4.1.1.2.1'
  ) {
    return true;
  }
  const intercept = decimal(dataSet.RescaleIntercept);
  const slope = decimal(dataSet.RescaleSlope);
  if (intercept !== undefined && slope !== undefined) {
    const minStoredPixelValue = PixelRepresentation === 1 ? -1 << (BitsStored - 1) : 0;
    return minStoredPixelValue * slope + intercept < 0;
  }
  return PixelRepresentation === 1;
}

/**
 * Tells whether the modality output is always an integer. The renderer looks the VOI LUT
 * up by that output without rounding, so a fractional rescale would read between
 * entries and render those pixels as the bottom of the range.
 *
 * @param modalityLUT the Modality LUT that the image applies, if any
 * @param slope rescale slope of the image
 * @param intercept rescale intercept of the image
 * @returns true when the VOI LUT can be applied
 */
function isModalityOutputInteger(modalityLUT, slope, intercept) {
  return !!modalityLUT || (Number.isInteger(Number(slope)) && Number.isInteger(Number(intercept)));
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

  // VOI LUT; skipped for a fractional rescale, see isModalityOutputInteger
  if (
    voiLUTSequence &&
    voiLUTSequence.length > 0 &&
    isModalityOutputInteger(image.modalityLUT, slope, intercept)
  ) {
    image.voiLUT = toCornerstoneLUT(
      voiLUTSequence[0],
      isModalityOutputSigned(dataSet, image.modalityLUT)
    );
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
