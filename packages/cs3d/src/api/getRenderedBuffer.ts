import createImage from "../image/createImage.js";
import { createCanvas } from "canvas";
import { utilities } from "@cornerstonejs/core";
import { setCanvasCreator } from "@cornerstonejs/core";
import canvasImageToBuffer from "../adapters/canvasImageToBuffer.js";

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
  doneCallback
) {
  setCanvasCreator(createCanvas);
  const canvas = createCanvas(256, 256) as unknown as HTMLCanvasElement;

  // try {
  const imageObj = createImage(
    transferSyntaxUid,
    decodedPixelData,
    metadata,
    canvas
  );

  await utilities.renderToCanvasCPU(canvas, imageObj);

  const buffer = canvasImageToBuffer(canvas);
  await doneCallback?.(buffer, canvas);
}

module.exports = getRenderedBuffer;
