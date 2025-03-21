import { createCanvas } from "canvas"
import { utilities } from "@cornerstonejs/core"
import { VOILUTFunctionType } from "@cornerstonejs/core/enums"
import { JSDOM } from "jsdom"

const dom = new JSDOM(`<!DOCTYPE html>`, { pretendToBeVisual: true })
global.window = dom.window
global.document = window.document

const rows = 64
const columns = 64
const numberOfComponents = 1

const bytePixelData = new Uint8Array(rows * columns * numberOfComponents)

const image = {
  imageId: "test:123",
  isPreScaled: false,
  minPixelValue: 0,
  maxPixelValue: 255,
  slope: 1,
  intercept: 0,
  windowCenter: 128,
  windowWidth: 255,
  voiLUTFunction: VOILUTFunctionType.LINEAR,
  getPixelData: () => bytePixelData,
  getCanvas: null,
  rows,
  columns,
  numberOfComponents,
  height: rows,
  width: columns,
  sizeInBytes: bytePixelData.byteLength,
  rowPixelSpacing: 1,
  columnPixelSpacing: 1,
  invert: false,
  color: numberOfComponents > 1,
  rgba: false,
  dataType: null,
  voxelManager: utilities.VoxelManager.createImageVoxelManager({
    width: columns,
    height: rows,
    scalarData: bytePixelData,
    numberOfComponents,
  }),
}

async function main() {
  const canvas = createCanvas(rows, columns)
  for (let i = 0; i < rows * columns; i++) {
    bytePixelData[i] = i % columns
  }
  await utilities.renderToCanvasCPU(
    canvas as unknown as HTMLCanvasElement,
    image
  )
  console.log("canvas", canvas.toDataURL("image/png"))
}

main().then(() => {
  console.log("Done converting")
})
