import { createCanvas } from 'canvas';
import { utilities, setCanvasCreator } from '@cornerstonejs/core';

import canvasImageToBuffer from '../adapters/canvasImageToBuffer';
import createImage from '../image/createImage';

function getValue(metadata, tag) {
  const value = metadata[tag];

  if (!value || !value.Value) {
    return;
  }
  return value.Value[0];
}

/** PS3.x-style one-line warning for thumbnail render skips (machine-readable UIDs) */
function warnThumbnailRenderDicom(metadata: Record<string, unknown> | undefined, err: unknown) {
  const study = metadata ? getValue(metadata, '0020000D') : undefined;
  const series = metadata ? getValue(metadata, '0020000E') : undefined;
  const sop = metadata ? getValue(metadata, '00080018') : undefined;
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(
    `*** DICOM warning [THUMBNAIL_RENDER] StudyInstanceUID=${study ?? 'unknown'} SeriesInstanceUID=${series ?? 'unknown'} SOPInstanceUID=${sop ?? 'unknown'}: ${reason}`
  );
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
export async function getRenderedBuffer(
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
    warnThumbnailRenderDicom(metadata as Record<string, unknown>, e);
  }
}
