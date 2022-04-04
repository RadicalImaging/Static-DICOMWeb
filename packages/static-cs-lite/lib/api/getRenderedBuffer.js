const createImage = require("../image/createImage");
const setUpEnv = require("../sandbox");
const canvasImageToBuffer = require("../adapters/canvasImageToBuffer");

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
function getRenderedBuffer(transferSyntaxUid, decodedPixelData, metadata, doneCallback) {
  const { csCore, canvas } = setUpEnv();

  function doneRendering(customEvent = {}) {
    const { detail = {} } = customEvent;
    const { enabledElement } = detail;

    if (!enabledElement || !enabledElement.canvas) {
      doneCallback();
    }

    const buffer = canvasImageToBuffer(enabledElement.canvas);
    doneCallback(buffer);
  }

  function failureRendering() {
    doneCallback();
  }

  try {
    const imageObj = createImage(transferSyntaxUid, decodedPixelData, metadata, canvas);

    canvas.addEventListener(csCore.EVENTS.IMAGE_RENDERED, doneRendering);
    csCore.renderToCanvas(canvas, imageObj);
  } catch (e) {
    console.log("Failed to render", e);
    failureRendering();
  }
}

module.exports = getRenderedBuffer;
