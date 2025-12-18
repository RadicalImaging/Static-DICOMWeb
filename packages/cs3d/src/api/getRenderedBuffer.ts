import { createCanvas } from 'canvas';
import { utilities, setCanvasCreator } from '@cornerstonejs/core';

import canvasImageToBuffer from '../adapters/canvasImageToBuffer.js';
import createImage from '../image/createImage.js';

function getValue(metadata, tag) {
  const value = metadata[tag];

  if (!value || !value.Value) {
    return;
  }
  return value.Value[0];
}
/**
 * It gets through callback call the rendered image into canvas.
 * It simulates rendering of decodedPixel data into server side (fake) canvas.
 * Once that is completed doneCallback is called (in case of failure/success)
 *
 * @param {*} transferSyntaxUid
 * @param {*} decodedPixelData data to be rendered on canvas
 * @param {*} metadata
 * @param {*} doneCallback Callback method that is invoked once image is rendered
 */
async function getRenderedBuffer(
  transferSyntaxUid,
  decodedPixelData,
  metadata,
  doneCallback,
  options = { quality: 0.3, width: 0, height: 0 }
) {
  try {
    setCanvasCreator(createCanvas);
    const rows = getValue(metadata, '00280010');
    const columns = getValue(metadata, '00280011');
    const quality = options?.quality || 1;
    const width = options.width || rows || 256;
    const height = options.height || columns || 256;
    const canvas = createCanvas(rows, columns) as unknown as HTMLCanvasElement;
    const canvasDest = createCanvas(
      parseFloat(width),
      parseFloat(height)
    ) as unknown as HTMLCanvasElement;

    // try {
    const imageObj = createImage(transferSyntaxUid, decodedPixelData, metadata, canvas);

    await utilities.renderToCanvasCPU(canvasDest, imageObj);

    const buffer = canvasImageToBuffer(canvasDest, 'image/jpeg', quality);
    await doneCallback?.(buffer, canvasDest);
  } catch (e) {
    console.warn('Unable to create rendered (thumbnail) because:', e);
  }
}

module.exports = getRenderedBuffer;
