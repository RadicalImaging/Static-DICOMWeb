const {
  cs3d,
  getRenderedBuffer,
  renderToCanvas,
} = require("@radicalimaging/cs3d")
const { createCanvas } = require("canvas")
// import("@cornerstonejs/core").then((cs3d) => {
//   console.log("Got cs3d", cs3d)
// })

function renderCanvas(width, height) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")
  expect(ctx).not.toBeUndefined()
  ctx.rotate(0.1)
  ctx.fillText("Awesome!", 50, 100)

  // Draw line under text
  var text = ctx.measureText("Awesome!")
  ctx.strokeStyle = "rgba(0,0,0,0.5)"
  ctx.beginPath()
  ctx.lineTo(50, 102)
  ctx.lineTo(50 + text.width, 102)
  ctx.stroke()
  return canvas
}

const iimage = {
  imageId: "imageid:test",
  minPixelValue: 0,
  maxPixelValue: 255,
  slipe: 1,
  intercept: 0,
  windowCenter: 128,
  windowWidth: 255,
  rows: 200,
  columns: 200,
  height: 200,
  width: 200,
  color: true,
  rgba: true,
  numberOfComponent: 3,
  columnPixelSpacing: 1,
  rowPixelSpacing: 1,
}

describe("@radicalimaging/cs3d", () => {
  it("Should load cs3d", () => {
    console.log("cs3d loader=", require("@radicalimaging/cs3d"))
    expect(getRenderedBuffer).not.toBeUndefined()
    // expect(renderToCanvas).not.toBeUndefined()
    expect(cs3d).not.toBeUndefined()
  })

  it("Canvas should work", () => {
    const canvas = renderCanvas(200, 200)
    console.log("toDataURL=", canvas.toDataURL())
    expect(canvas.toDataURL()).not.toBeUndefined()
  })

  it("Should be able to draw a canvas", () => {
    const { utilities } = cs3d

    const destinationCanvas = createCanvas(256, 256)
    const canvas = renderCanvas(200, 200)
    iimage.getCanvas = () => canvas

    const loadPromise = utilities.renderToCanvasCPU(destinationCanvas, iimage)
    return loadPromise.then(() => {
      console.warn("Loaded canvas")
      console.warn("destinationCanvas=", destinationCanvas.toDataURL())
    })
  })
})
